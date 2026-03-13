# Extalk - 极简、高性能的边缘评论系统

**Extalk** 是一款基于 Cloudflare Workers 边缘计算架构构建的现代化开源评论系统。专为静态网站（如 Hugo、Hexo、Fuwari 等）设计，提供极致轻量、安全且具备社交属性的交互体验。

---

## ✨ 核心功能

### 🎨 现代化交互体验
- **透明融合 UI**：无缝契合各种博客主题，移除传统"框中框"设计
- **折叠式评论框**：默认收起，点击展开，最大程度减少对文章内容的干扰
- **无限嵌套回复**：支持多级对话流，逻辑清晰
- **实时评论排序**：评论按时间从新到旧自动排序，支持分页浏览

### 📊 数据统计与互动
- **浏览量统计**：不记录隐私的纯计数方案，集成在评论区顶部
- **双重点击互动**：支持文章点赞与单条评论点赞，提升互动率
- **智能楼层显示**：自动计算评论楼层，便于用户定位

### 🛡️ 安全保障机制
- **hCaptcha 全程守护**：有效拦截机器人垃圾评论
- **JWT 身份认证**：安全的管理员后台与用户登录态管理
- **CORS 域名锁**：仅允许授权域名挂载，防止非法盗用
- **IP 属地显示**：内置 GBK 转码引擎，精准显示评论者省份/城市属地

### 📧 自动化通知系统
- **OTP 验证码注册**：确保用户邮箱真实性
- **智能同步汇总**：管理员可自定义频率接收近期评论汇总邮件

---

## � 快速部署

### 环境要求
- Cloudflare 账户
- Wrangler CLI (v4.71.0+)

### 1. 项目初始化
```bash
git clone https://github.com/lijiaxu2021/extalk.git
cd extalk
npm install
```

### 2. 数据库初始化
```bash
# 创建数据库
npx wrangler d1 create fuwari_comments_db

# 应用数据库schema
npx wrangler d1 execute fuwari_comments_db --remote --file=schema.sql
```

### 3. 配置环境变量
在 Cloudflare 控制台设置环境变量（或修改 `wrangler.toml` 中的 `[vars]`）：

```toml
[vars]
HCAPTCHA_SECRET_KEY = "your-hcaptcha-secret"
RESEND_API_KEY = "your-resend-api-key"
JWT_SECRET = "your-jwt-secret-key"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASS = "admin-password"
BASE_URL = "https://your-worker-domain.workers.dev"
```

### 4. 部署到 Cloudflare
```bash
npx wrangler deploy
```

### 5. 初始化管理员账户
访问以下URL初始化管理员：
```
https://your-worker-domain.workers.dev/init-admin-999
```

---

## 🛠️ 技术实现方案

### 后端架构 (Cloudflare Workers + D1)

#### 数据库架构设计

**核心数据表结构：**

```sql
-- 用户表：存储注册用户和管理员信息
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,           -- 用户邮箱（登录凭证）
  nickname TEXT NOT NULL,                -- 用户昵称
  password_hash TEXT NOT NULL,           -- bcrypt 加密的密码哈希
  role TEXT DEFAULT 'user',              -- 角色：'admin' 或 'user'
  verified INTEGER DEFAULT 0,            -- 邮箱验证状态
  verification_token TEXT,               -- OTP 验证令牌
  ip_display_level TEXT DEFAULT 'province', -- IP 属地显示精度
  max_comment_length INTEGER DEFAULT 500,   -- 评论长度限制
  sync_interval_minutes INTEGER DEFAULT 60, -- 邮件同步频率（分钟）
  last_sync_at DATETIME,                 -- 上次同步时间
  created_at DATETIME                    -- 注册时间（UTC+8）
);

-- 域名白名单表：CORS 域名授权
CREATE TABLE allowed_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT UNIQUE NOT NULL,          -- 域名模式：'example.com', '*.example.com'
  created_at DATETIME
);

-- 评论表：核心数据存储
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_url TEXT NOT NULL,                -- 页面 URL（分区键）
  nickname TEXT NOT NULL,                -- 评论者昵称
  content TEXT NOT NULL,                 -- 评论内容
  parent_id INTEGER DEFAULT NULL,        -- 父评论 ID（嵌套回复）
  user_id INTEGER DEFAULT NULL,          -- 用户 ID（NULL 表示游客）
  ip TEXT,                               -- 评论者 IP 地址
  location TEXT,                         -- IP 属地（省份/城市）
  likes INTEGER DEFAULT 0,               -- 点赞数
  created_at DATETIME,                   -- 创建时间（UTC+8）
  FOREIGN KEY(parent_id) REFERENCES comments(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- 页面统计表的：浏览量与点赞数
CREATE TABLE page_views (
  page_url TEXT PRIMARY KEY,             -- 页面 URL
  views INTEGER DEFAULT 0,               -- 累计浏览量
  likes INTEGER DEFAULT 0,               -- 累计点赞数
  updated_at DATETIME                    -- 最后更新时间
);
```

**索引优化策略：**
```sql
-- 为评论表创建索引，加速页面查询
CREATE INDEX idx_comments_page_url ON comments(page_url);
```

#### 数据一致性与事务处理

- **D1 事务支持**：利用 SQLite 的 ACID 特性，确保评论计数、嵌套关系的原子性操作
- **时间同步机制**：全站强制使用北京时间 (UTC+8)，从数据库 `datetime('now', '+8 hours')` 到前端显示，彻底解决时区混乱
- **外键约束**：通过 `FOREIGN KEY` 确保评论与用户、评论与评论之间的引用完整性

#### API 设计规范

```typescript
// 获取评论（支持分页）
GET /comments?url={page_url}&page={page}&limit={limit}
Response: {
  comments: Comment[],
  total: number,
  page: number,
  totalPages: number
}

// 提交评论
POST /comments
Body: {
  page_url: string,
  nickname: string,
  content: string,
  hcaptcha_token: string,
  parent_id: number | null
}

// 评论点赞
POST /comment/like
Body: { id: number }

// 页面浏览量和点赞
POST /view
Body: { url: string }
```

#### 安全机制实现

- **域名验证中间件**：基于 `allowed_domains` 表的白名单验证，支持通配符匹配
- **请求频率限制**：基于 IP 的频率控制，防止恶意刷评论
- **输入验证与过滤**：SQL 注入防护、XSS 过滤、内容长度限制
- **JWT Token 认证**：管理员后台和注册用户登录态管理

### 前端架构 (Vanilla JS SDK)

#### 零依赖设计理念

- **纯 JavaScript 实现**：不使用任何框架，SDK 体积 < 50KB（压缩后）
- **渐进式加载**：hCaptcha、字体等第三方资源仅在需要时加载
- **CSS 命名空间**：通过独立的样式前缀防止与原站样式冲突
- **Shadow DOM 风格隔离**：模拟 Shadow DOM 的样式隔离效果

#### 评论渲染引擎

```javascript
// 双排序策略：根评论降序（最新在前），回复升序（时间线）
const rootComments = allComments
  .filter(c => !c.parent_id)
  .sort((a, b) => b.created_at.localeCompare(a.created_at));

const replies = allComments
  .filter(c => c.parent_id)
  .sort((a, b) => a.created_at.localeCompare(b.created_at));

// 滚动触发动画：Intersection Observer API
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate-in');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.3, rootMargin: '0px 0px -100px 0px' });
```

#### 分页与性能优化

- **后端 LIMIT/OFFSET 分页**：数据库层面减少数据传输量
- **前端虚拟滚动**：动态渲染可见区域的评论项
- **懒加载策略**：图片、表情等资源延迟加载
- **防抖节流**：点赞、提交等操作的防抖处理

### 邮件通知系统

#### 异步任务架构

- **Cron Triggers 定时任务**：`* * * * *` 每分钟检查待同步评论
- **批量处理**：一次性汇总 `sync_interval_minutes` 内的所有评论
- **HTML 邮件模板**：响应式设计，包含评论摘要、统计图表、管理链接

#### 配置参数详解

```sql
-- 管理员可配置的同步参数
sync_interval_minutes INTEGER DEFAULT 60  -- 0=禁用，>0=启用
max_comment_length INTEGER DEFAULT 500    -- 单条评论最大长度
ip_display_level TEXT DEFAULT 'province'  -- 'province' 或 'city'
```

### 性能优化策略

#### 边缘计算优势

- **全球 275+ 节点分发**：评论数据在离用户最近的 Cloudflare 节点处理
- **V8 Isolates 架构**：毫秒级冷启动，零等待响应
- **无状态设计**：Workers 无状态特性确保水平扩展能力

#### 多级缓存策略

```typescript
// 内存缓存：页面统计数据
const cache = new Map<string, { views: number, likes: number }>();

// D1 数据库：持久化评论数据
const comments = await env.DB.prepare(
  "SELECT * FROM comments WHERE page_url = ? LIMIT ? OFFSET ?"
).bind(pageUrl, limit, offset).all();

// 本地存储：用户登录态
localStorage.setItem('extalk_user', JSON.stringify(userData));
```

#### 网络优化

- **HTTP/2 多路复用**：减少连接建立开销
- **资源压缩**：Gzip/Brotli 压缩，SDK 体积减少 70%
- **CDN 加速**：静态资源通过 Cloudflare CDN 全球分发

---

## 📝 开源协议
本项目基于 **MIT License** 开源。

---
由 [upxuu.com](https://upxuu.com) 驱动。