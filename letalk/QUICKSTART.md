# Letalk 论坛 - 快速启动指南

## 🚀 5 分钟快速开始

### 第一步：安装依赖

```bash
cd letalk
npm install
```

### 第二步：配置 Cloudflare

1. **安装 Wrangler CLI**
```bash
npm install -g wrangler
```

2. **登录 Cloudflare**
```bash
wrangler login
```

3. **创建 D1 数据库**
```bash
wrangler d1 create letalk-db
```

4. **复制数据库 ID**
   - 命令执行后会返回一个 `database_id`
   - 打开 `wrangler.toml` 文件
   - 将 `database_id = "your-database-id-here"` 替换为实际的数据库 ID

### 第三步：初始化数据库

```bash
npm run db:init
```

这会创建所有必要的表并插入默认数据。

### 第四步：配置环境变量

编辑 `wrangler.toml` 文件，设置以下变量:

```toml
[vars]
HCAPTCHA_SECRET_KEY = "你的 hCaptcha 密钥"
HCAPTCHA_SITE_KEY = "你的 hCaptcha 站点密钥"
RESEND_API_KEY = "你的 Resend API 密钥"
JWT_SECRET = "自定义一个复杂的 JWT 密钥"
ADMIN_EMAIL = "admin@letalk.com"
ADMIN_PASS = "你的管理员密码"
BASE_URL = "http://localhost:8787"
FORUM_NAME = "Letalk"
```

#### 获取必要密钥:

1. **hCaptcha**
   - 访问 https://www.hcaptcha.com/
   - 注册账号并创建站点
   - 获取 Site Key 和 Secret Key

2. **Resend (邮件服务)**
   - 访问 https://resend.com/
   - 注册账号并获取 API Key
   - 免费版每月可发送 3000 封邮件

### 第五步：启动开发服务器

```bash
npm run dev
```

访问 http://localhost:8787 即可看到论坛首页!

## 📝 默认管理员账号

- **邮箱**: admin@letalk.com
- **密码**: 在 wrangler.toml 中设置的 ADMIN_PASS

## 🎯 下一步

1. **修改默认密码** - 首次登录后立即修改
2. **创建板块** - 在管理后台创建新的论坛板块
3. **自定义样式** - 编辑 `frontend/assets/css/style.css`
4. **添加内容** - 发布一些测试主题和回复

## 🔧 常用命令

```bash
# 本地开发
npm run dev

# 部署到生产环境
npm run deploy

# 初始化数据库 (本地)
npm run db:init

# 初始化数据库 (生产)
npm run db:prod
```

## ⚠️ 常见问题

### 1. 数据库错误
如果遇到数据库相关错误:
```bash
# 删除并重新创建数据库
wrangler d1 delete letalk-db
wrangler d1 create letalk-db
# 更新 wrangler.toml 中的 database_id
npm run db:init
```

### 2. hCaptcha 不显示
- 检查 Site Key 是否正确
- 确保网络能访问 hcaptcha.com
- 开发环境可以使用测试密钥: `10000000-ffff-ffff-ffff-000000000001`

### 3. 邮件发送失败
- 检查 Resend API Key 是否正确
- 验证发件人域名 (在 Resend 后台添加)
- 查看 Resend 后台的发送日志

### 4. 登录状态失效
- 清除浏览器缓存
- 检查 JWT_SECRET 是否一致
- 确认 localStorage 中有 `letalk_user` 数据

## 📚 项目结构概览

```
letalk/
├── src/           # 后端代码
├── frontend/      # 前端页面
├── schema.sql     # 数据库结构
├── wrangler.toml  # Cloudflare 配置
└── package.json   # 项目配置
```

## 🎨 自定义配色

编辑 `frontend/assets/css/style.css` 中的 CSS 变量:

```css
:root {
  --primary-color: #0070f3;    /* 主色调 */
  --secondary-color: #10b981;  /* 辅助色 */
  --danger-color: #ef4444;     /* 危险色 */
  /* ... */
}
```

## 📞 获取帮助

- 查看 [README.md](README.md) 了解完整功能
- 查看 [PROGRESS.md](PROGRESS.md) 了解开发进度
- 提交 Issue 反馈问题

---

祝你使用愉快！🎉
