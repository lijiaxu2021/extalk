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

#### 数据存储与一致性
- **D1 数据库**：基于 SQLite 的边缘数据库，利用事务特性确保评论计数与嵌套逻辑的准确性
- **时间同步**：全站强制使用北京时间 (UTC+8)，从数据库存储到前端显示，彻底解决时区混乱问题

#### API 设计
```typescript
// 评论获取 API
GET /comments?url={page_url}&page={page}&limit={limit}

// 评论提交 API  
POST /comments
{
  "page_url": string,
  "nickname": string,
  "content": string,
  "hcaptcha_token": string,
  "parent_id": number | null
}

// 点赞 API
POST /comment/like
POST /view (页面点赞)
```

#### 安全机制
- **域名验证**：基于白名单的域名授权机制
- **请求频率限制**：防止恶意刷评论
- **输入验证**：SQL注入防护和内容长度限制

### 前端架构 (Vanilla JS SDK)

#### 零依赖设计
- **纯 JavaScript**：不使用任何前端框架，确保 SDK 体积最小化
- **按需加载**：仅在需要时初始化 hCaptcha 等第三方组件
- **Shadow DOM 风格**：通过独立的 CSS 命名空间防止与原站样式冲突

#### 评论渲染逻辑
```javascript
// 评论排序：根评论按时间降序，回复按时间升序
const rootComments = allComments.filter(c => !c.parent_id).sort((a, b) => 
  b.created_at.localeCompare(a.created_at)
);
const replies = allComments.filter(c => c.parent_id).sort((a, b) =>
  a.created_at.localeCompare(b.created_at)
);
```

#### 分页实现
- **后端分页**：数据库层面实现 LIMIT/OFFSET 分页
- **前端渲染**：动态生成分页控件，支持平滑滚动
- **楼层计算**：基于总评论数和当前页码智能计算楼层号

### 邮件通知系统

#### 异步处理
- **Cloudflare Cron Triggers**：基于定时任务实现异步汇总逻辑
- **邮件模板**：支持 HTML 格式的邮件模板，包含评论摘要和统计信息

#### 配置选项
```sql
-- 管理员可配置同步频率
sync_interval_minutes INTEGER DEFAULT 60

-- 评论内容长度限制
max_comment_length INTEGER DEFAULT 500
```

### 性能优化策略

#### 边缘计算优势
- **全球分发**：评论数据在离用户最近的节点处理
- **低延迟**：基于 Cloudflare 全球网络，实现毫秒级响应
- **零冷启动**：V8 引擎的 Workers 启动速度远超传统容器化方案

#### 缓存策略
- **页面视图缓存**：页面浏览量和点赞数使用内存缓存
- **评论数据优化**：分页查询减少数据传输量

---

## 📝 开源协议
本项目基于 **MIT License** 开源。

---
由 [upxuu.com](https://upxuu.com) 驱动。