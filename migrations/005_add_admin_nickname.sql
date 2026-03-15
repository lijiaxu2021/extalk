-- 添加管理员自定义昵称
ALTER TABLE users ADD COLUMN admin_nickname TEXT;

-- 更新现有管理员的 admin_nickname
UPDATE users SET admin_nickname = 'upxuu' WHERE role = 'admin';
