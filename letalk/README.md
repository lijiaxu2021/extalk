# Letalk Forum

一个现代化的前后端分离论坛系统，基于 Cloudflare Workers 构建。

## 🚀 特性

- **前后端分离** - 清晰的架构，易于维护和扩展
- **用户认证** - JWT + 邮箱验证 + hCaptcha 人机验证
- **论坛板块** - 多级分类，支持自定义图标和描述
- **主题系统** - 支持置顶、加精、锁定等功能
- **回复系统** - 楼中楼回复，@提及，点赞功能
- **消息通知** - 回复、点赞、@提及实时通知
- **积分系统** - 用户等级和经验值
- **管理后台** - 用户管理、内容审核、数据统计
- **响应式设计** - 完美支持桌面和移动端

## 📁 项目结构

```
letalk/
├── src/
│   ├── index.ts              # 主入口
│   ├── api/
│   │   ├── auth.ts           # 认证 API
│   │   ├── users.ts          # 用户 API
│   │   ├── boards.ts         # 板块 API
│   │   ├── threads.ts        # 主题 API
│   │   ├── posts.ts          # 回复 API
│   │   └── admin.ts          # 管理 API
│   └── utils/
│       ├── jwt.ts            # JWT 工具
│       └── email.ts          # 邮件服务
├── frontend/
│   ├── index.html            # 首页
│   ├── login.html            # 登录页
│   ├── register.html         # 注册页
│   ├── boards.html           # 板块列表
│   ├── thread.html           # 主题详情
│   ├── user.html             # 用户中心
│   └── assets/
│       ├── css/
│       │   └── style.css     # 样式文件
│       └── js/
│           └── app.js        # 通用 JS
├── schema.sql                # 数据库结构
├── wrangler.toml             # Cloudflare 配置
└── package.json              # 项目配置
```

## 🛠️ 技术栈

- **后端**: Cloudflare Workers + TypeScript
- **数据库**: Cloudflare D1 (SQLite)
- **前端**: 原生 JavaScript + CSS
- **认证**: JWT
- **邮件**: Resend API
- **人机验证**: hCaptcha

## 📦 安装和部署

### 1. 环境准备

```bash
# 安装 Node.js (v16+)
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login
```

### 2. 初始化数据库

```bash
# 创建 D1 数据库
wrangler d1 create letalk-db

# 将数据库 ID 复制到 wrangler.toml

# 初始化数据库结构
npm run db:init
```

### 3. 配置环境变量

编辑 `wrangler.toml` 文件，设置以下环境变量:

```toml
HCAPTCHA_SECRET_KEY = "你的 hCaptcha 密钥"
HCAPTCHA_SITE_KEY = "你的 hCaptcha 站点密钥"
RESEND_API_KEY = "你的 Resend API 密钥"
JWT_SECRET = "自定义 JWT 密钥"
ADMIN_EMAIL = "管理员邮箱"
ADMIN_PASS = "管理员密码"
BASE_URL = "https://你的域名.com"
```

### 4. 本地开发

```bash
npm install
npm run dev
```

访问 http://localhost:8787

### 5. 部署到生产环境

```bash
npm run deploy
```

## 📖 API 文档

### 认证相关

```
POST /api/auth/register     # 注册
POST /api/auth/login        # 登录
POST /api/auth/verify       # 验证邮箱
POST /api/auth/logout       # 登出
```

### 用户相关

```
GET  /api/users/me          # 获取当前用户信息
PUT  /api/users/profile     # 更新用户资料
GET  /api/users/threads     # 我的主题
GET  /api/users/posts       # 我的回复
```

### 板块相关

```
GET  /api/boards            # 获取所有板块
GET  /api/boards/:slug      # 获取板块详情
GET  /api/boards/:slug/threads  # 获取板块主题列表
```

### 主题相关

```
POST /api/threads           # 创建主题
GET  /api/threads/:id       # 获取主题详情
PUT  /api/threads/:id       # 更新主题
DELETE /api/threads/:id     # 删除主题
POST /api/threads/:id/like  # 点赞主题
POST /api/threads/:id/favorite # 收藏主题
```

### 回复相关

```
POST /api/posts             # 创建回复
GET  /api/posts/:thread     # 获取主题下的回复
POST /api/posts/:id/like    # 点赞回复
```

### 管理相关

```
GET  /api/admin/stats       # 统计数据
POST /api/admin/boards      # 创建板块
PUT  /api/admin/threads/:id # 管理主题
PUT  /api/admin/users/:id   # 管理用户
GET  /api/admin/logs        # 管理日志
```

## 🎨 前端页面

- **首页** (`/`) - 展示统计、板块列表、最新主题
- **登录页** (`/login.html`) - 用户登录
- **注册页** (`/register.html`) - 用户注册
- **板块列表** (`/boards.html`) - 所有板块
- **主题详情** (`/thread.html?id=1`) - 主题内容和回复
- **用户中心** (`/user.html`) - 个人资料、我的主题/回复

## 🔧 开发计划

- [x] 用户认证系统
- [x] 论坛板块管理
- [x] 主题/帖子管理
- [x] 回复系统
- [x] 基础前端页面
- [ ] 主题详情页
- [ ] 用户中心页面
- [ ] 管理后台界面
- [ ] 消息通知系统
- [ ] 搜索功能
- [ ] 图片上传
- [ ] 富文本编辑器
- [ ] 用户积分系统

## 📝 注意事项

1. **数据库初始化**: 首次部署需要运行 `npm run db:init` 初始化数据库
2. **管理员账号**: 默认管理员邮箱为 `admin@letalk.com`,密码在 `wrangler.toml` 中设置
3. **hCaptcha**: 需要在 [hCaptcha](https://www.hcaptcha.com/) 注册并获取密钥
4. **邮件服务**: 需要在 [Resend](https://resend.com/) 注册并获取 API 密钥
5. **域名配置**: 生产环境需要配置自定义域名和 HTTPS

## 🤝 贡献

欢迎提交 Issue 和 Pull Request!

## 📄 许可证

MIT License

## 📞 联系方式

- 项目地址：https://github.com/yourusername/letalk
- 问题反馈：请提交 Issue

---

**Letalk** - 让交流更美好 💬
