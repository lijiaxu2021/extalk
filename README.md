# Extalk - 极简、高性能的边缘评论系统 (upxuu.com)

**Extalk** 是一款基于 Cloudflare 边缘计算架构构建的现代化开源评论系统。它旨在为静态网站（如 Fuwari, Hugo, Hexo）提供极致轻量、安全且具备社交属性的交互体验。

---

## 🚀 为什么选择 Extalk？

### 1. 边缘计算的极致性能
Extalk 完全运行在 Cloudflare Workers 边缘节点上。与传统的中心化服务器相比：
- **更低延迟**：评论数据在离用户最近的节点处理。
- **冷启动近乎零**：基于 V8 引擎的 Workers 启动速度远超传统的容器化方案。
- **全球分发**：天然支持全球访问加速。

### 2. 零成本维护 (Serverless)
- **数据库**：使用 Cloudflare D1 (SQLite on Edge)，无需管理数据库实例，自动扩容。
- **存储**：完全无状态设计，无需购买虚拟主机或云服务器。
- **免费额度**：在 Cloudflare 的免费计划下，足以支撑中小型个人博客的日常运营。

### 3. 深度定制的“融合”交互
- **透明 UI 设计**：摒弃了传统的“框中框”设计，移除所有繁重的背景和阴影，实现与原站风格的无缝融合。
- **折叠式交互**：默认收起评论框，最大程度减少对文章内容的干扰，仅在用户有表达欲望时展开。

---

## ✨ 核心功能

- **🎨 现代化交互**：
  - **透明融合 UI**：无缝契合各种博客主题。
  - **折叠式评论框**：点击展开，极致简洁。
  - **无限嵌套回复**：支持多级对话流，逻辑清晰。
- **📊 实时数据统计**：
  - **浏览量统计**：不记录隐私的纯计数方案，集成在评论区顶部。
  - **双重点击互动**：支持文章点赞与单条评论点赞，提升互动率。
- **🛡️ 银行级安全保障**：
  - **hCaptcha 全程守护**：有效拦截机器人垃圾评论。
  - **JWT 身份认证**：安全的管理员后台与用户登录态管理。
  - **CORS 域名锁**：仅允许授权域名挂载，防止非法盗用。
- **📧 自动化通知系统**：
  - **OTP 验证码注册**：确保用户邮箱真实性。
  - **智能同步汇总**：管理员可自定义频率（如每 1h2min）接收近期评论汇总邮件。
- **📍 IP 属地显示**：内置 GBK 转码引擎，精准显示评论者省份/城市属地。

---

## 🛠️ 实现方案架构

### 后端 (Cloudflare Workers + D1)
- **数据一致性**：利用 D1 的事务特性，确保评论计数与嵌套逻辑的准确。
- **时间同步**：全站强制使用 **北京时间 (UTC+8)**，从数据库存储到前端显示，彻底解决时区混乱问题。
- **按需汇总**：基于 Cloudflare Cron Triggers 实现异步汇总逻辑，避免在主请求中处理耗时的邮件发送。

### 前端 (Vanilla JS SDK)
- **零依赖**：不使用任何前端框架（如 React/Vue），确保 SDK 体积最小化。
- ** shadow DOM 风格**：通过独立的 CSS 命名空间防止与原站样式冲突。
- **按需加载**：仅在需要时初始化 hCaptcha 等第三方组件。

---

## 📊 对比分析

| 特性 | Extalk | Valine / Waline | Gitalk / Utterances |
| :--- | :--- | :--- | :--- |
| **部署成本** | **0元 (Cloudflare)** | 需 LeanCloud 或服务器 | 0元 (GitHub Issues) |
| **性能** | **极高 (Edge Nodes)** | 中等 (取决于服务器) | 较低 (依赖 GitHub API) |
| **隐私性** | **高 (完全自控)** | 中等 (第三方托管) | 高 (GitHub 托管) |
| **UI 融合度** | **极致 (透明折叠)** | 一般 (独立卡片) | 较差 (固定风格) |
| **属地显示** | **支持** | 部分支持 | 不支持 |
| **点赞/浏览量**| **全集成** | 需额外插件 | 不支持 |

---

## 🚀 快速部署

### 1. 准备工作
1. 注册 [Cloudflare](https://dash.cloudflare.com/) 账号。
2. 安装 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)。

### 2. 初始化环境
```bash
git clone https://github.com/lijiaxu2021/extalk.git
cd extalk
# 修改 wrangler.toml 中的 database_id
npx wrangler d1 execute <YOUR_DB_NAME> --remote --file=schema.sql
```

### 3. 配置变量
在 Cloudflare 控制台设置（或修改 `wrangler.toml` 中的 `[vars]`）：
- `ADMIN_EMAIL`: 管理员初始邮箱
- `ADMIN_PASS`: 管理员初始密码
- `BASE_URL`: 你的 Worker 服务地址 (如 `https://comment.upxuu.com`)
- `HCAPTCHA_SECRET_KEY`: hCaptcha 私钥
- `RESEND_API_KEY`: Resend 邮件密钥
- `JWT_SECRET`: 鉴权密钥

### 4. 部署
```bash
npx wrangler deploy
```

---

## 📝 开源协议
本项目基于 **MIT License** 开源。

---
由 [upxuu.com](https://upxuu.com) 驱动。
