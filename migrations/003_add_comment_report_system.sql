-- 评论举报功能迁移脚本

-- 1. 为评论添加举报相关字段（如果不存在）
ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_reported INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_hidden INTEGER DEFAULT 0;

-- 2. 创建举报记录表
CREATE TABLE IF NOT EXISTS comment_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  reporter_ip TEXT,
  reporter_visitor_id TEXT,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now', '+8 hours')),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

-- 3. 为举报相关字段添加索引
CREATE INDEX IF NOT EXISTS idx_comments_is_reported ON comments(is_reported);
CREATE INDEX IF NOT EXISTS idx_comments_is_hidden ON comments(is_hidden);
CREATE INDEX IF NOT EXISTS idx_comment_reports_comment_id ON comment_reports(comment_id);

-- 4. 添加举报配置到 users 表（如果不存在）
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_hide_threshold INTEGER DEFAULT 3;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications_enabled INTEGER DEFAULT 1;
