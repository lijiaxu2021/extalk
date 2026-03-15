# Letalk 论坛 - 部署完成

## ✅ 部署成功

**访问地址**: https://letalk-forum.lijiaxulove.workers.dev

## 🎯 初始设置

### 1. 创建管理员账号

由于安全原因，需要通过注册流程创建管理员账号:

1. 访问 https://letalk-forum.lijiaxulove.workers.dev/register.html
2. 使用以下信息注册:
   - **昵称**: Admin
   - **邮箱**: lijiaxulove@outlook.com
   - **密码**: lijiaxuupxuu2011
3. 检查邮箱获取验证码
4. 完成验证

### 2. 手动设置为管理员

注册完成后，需要在数据库中手动设置管理员权限:

```bash
# 使用 Wrangler 执行 SQL
wrangler d1 execute letalk-db --remote --command="UPDATE users SET role='admin', level=10 WHERE email='lijiaxulove@outlook.com'"
```

或者在 Cloudflare Dashboard 中:
1. 进入 D1 数据库
2. 执行 SQL 命令
3. 更新用户角色

## 📊 数据库信息

- **数据库名称**: letalk-db
- **数据库 ID**: 101d1710-e019-4ac0-a8f8-26e4fa1a509e
- **区域**: WNAM (West North America)

## 🔧 配置信息

已配置的环境变量:
- ✅ hCaptcha (人机验证)
- ✅ Resend (邮件服务)
- ✅ JWT 密钥
- ✅ 管理员配置

## 🌐 自定义域名

当前使用 Workers 默认域名。如需使用自定义域名:

1. 在 Cloudflare Dashboard 添加域名
2. 绑定到 Worker: `letalk-forum`
3. 更新 `wrangler.toml` 中的 `BASE_URL`
4. 重新部署：`wrangler deploy`

## 📝 常用命令

```bash
# 本地开发
npm run dev

# 部署
npm run deploy

# 数据库操作
wrangler d1 execute letalk-db --remote --command="SELECT * FROM users"
wrangler d1 execute letalk-db --remote --file=./schema.sql

# 查看日志
wrangler tail
```

## 🎨 默认数据

数据库已初始化以下数据:

### 分类
1. 综合讨论区 💬
2. 技术交流区 💻
3. 生活娱乐区 🎮

### 板块
- 灌水区 (综合讨论区)
- 建议反馈 (综合讨论区)
- 前端开发 (技术交流区)
- 后端开发 (技术交流区)
- 闲聊灌水 (生活娱乐区)

## 🚀 下一步

1. ✅ 访问论坛查看效果
2. ✅ 注册管理员账号
3. ✅ 设置管理员权限
4. 📝 发布测试主题
5. 📝 邀请用户加入

## ⚠️ 注意事项

1. **安全第一**: 首次登录后建议修改密码
2. **邮件配额**: Resend 免费版每月 3000 封
3. **hCaptcha**: 生产环境建议使用正式密钥
4. **数据库备份**: 定期导出 D1 数据库备份

## 📞 问题排查

如果遇到问题:

1. **查看日志**
   ```bash
   wrangler tail
   ```

2. **检查数据库**
   ```bash
   wrangler d1 execute letalk-db --remote
   ```

3. **重新部署**
   ```bash
   wrangler deploy --force
   ```

---

**Letalk Forum** - 让交流更美好 💬
