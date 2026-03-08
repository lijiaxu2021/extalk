# Extalk - 开源评论系统 (upxuu.com)

**Extalk** 是一款基于 Cloudflare Workers + D1 数据库 + Resend 邮件服务构建的轻量级、高性能、现代化的开源评论系统。

## 🌟 核心特性

- **🚀 极致性能**：依托 Cloudflare 全球边缘网络，毫秒级响应。
- **💬 无限嵌套回复**：支持多级回复逻辑，递归渲染对话流。
- **📧 智能通知汇总**：
  - **验证码注册**：支持 6 位 OTP 验证码，安全可靠。
  - **定时汇总**：管理员可自定义频率（如每 1h2min）接收近期评论汇总邮件。
- **🛡️ 安全防护**：
  - **hCaptcha 集成**：全接口（注册/登录/评论）人机验证。
  - **域名白名单**：支持通配符（如 `*.upxuu.com`），防止跨站挂载。
  - **JWT 鉴权**：安全管理后台与用户状态。
- **🎨 现代化 UI**：
  - 浅蓝色调，优雅的圆角卡片设计。
  - 顺滑的滑入动画与交互反馈。
  - 响应式布局，适配桌面与移动端。
- **📍 IP 属地显示**：支持显示评论者省份/城市属地（基于 PCOnline API，内置 GBK 转码）。
- **⚙️ 强大管理后台**：
  - 域名授权管理。
  - 评论审核与一键删除。
  - 系统参数自定义（评论字数限制、属地精度、同步频率等）。

## 🛠️ 技术栈

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite on Edge)
- **Email**: [Resend](https://resend.com/)
- **Captcha**: [hCaptcha](https://www.hcaptcha.com/)
- **Frontend**: Vanilla JS (SDK 模式，零依赖)

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/lijiaxu2021/extalk.git
cd extalk
```

### 2. 配置环境
复制并修改配置文件（**注意：不要泄露你的密钥**）：
1. 在 Cloudflare 控制台创建 D1 数据库。
2. 修改 `wrangler.toml` 中的 `database_id`。
3. 在 Cloudflare Dashboard 设置以下环境变量（或在 `wrangler.toml` 的 `[vars]` 中临时设置）：
   - `HCAPTCHA_SECRET_KEY`: hCaptcha 私钥
   - `RESEND_API_KEY`: Resend API 密钥
   - `JWT_SECRET`: 随机字符串，用于加密 Token

### 3. 初始化数据库
使用 `schema.sql` 初始化你的 D1 数据库：
```bash
npx wrangler d1 execute <YOUR_DB_NAME> --remote --file=schema.sql
```

### 4. 部署
```bash
npx wrangler deploy
```

## 📝 集成到你的网站

在你的 HTML 页面中加入以下代码：

1. **引入 SDK**：
```html
<script src="https://your-worker-domain.com/sdk.js" defer></script>
```

2. **放置容器**：
```html
<div id="fuwari-comments"></div>
```

## 🔧 后台管理

访问 `https://your-worker-domain.com/upxuuadmin` 进入管理后台。
首次使用需通过 `/init-admin-999` 接口初始化管理员账号（建议部署后立即操作并删除该接口逻辑）。

## ⚠️ 安全说明

- **敏感信息**：项目根目录下的 `wrangler.toml` 可能包含敏感信息，已在 `.gitignore` 中排除。
- **开源协议**：本项目采用 MIT 协议开源。

---
由 [upxuu.com](https://upxuu.com) 驱动。
