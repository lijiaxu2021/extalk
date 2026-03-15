-- 初始化管理员账号 (密码：lijiaxuupxuu2011)
-- 注意：密码需要在应用中哈希后更新

-- 先删除默认的空密码管理员
DELETE FROM users WHERE email = 'admin@letalk.com';

-- 插入新管理员 (密码需要在应用中通过 hashPassword 函数生成)
-- 这里使用 SQL 直接插入哈希后的密码
-- SHA256('lijiaxuupxuu2011') = 需要应用生成

-- 临时方案：创建一个未验证的管理员，然后通过注册流程验证
INSERT INTO users (email, nickname, password_hash, role, verified, level, experience) 
VALUES ('lijiaxulove@outlook.com', 'Admin', '待更新', 'admin', 1, 10, 0);
