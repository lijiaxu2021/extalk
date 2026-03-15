-- 添加 GitHub 登录支持
ALTER TABLE users ADD COLUMN github_id TEXT;
ALTER TABLE users ADD COLUMN github_username TEXT;
ALTER TABLE users ADD COLUMN github_avatar_url TEXT;
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
