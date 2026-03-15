-- 添加评论编辑功能所需的字段和表

-- 1. 为 comments 表添加新字段
ALTER TABLE comments ADD COLUMN visitor_id TEXT DEFAULT NULL;
ALTER TABLE comments ADD COLUMN edited_at TEXT DEFAULT NULL;
ALTER TABLE comments ADD COLUMN is_edited INTEGER DEFAULT 0;

-- 2. 创建评论编辑历史表（管理员可见）
CREATE TABLE IF NOT EXISTS comment_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  old_content TEXT NOT NULL,
  edited_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', '+8 hours')),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

-- 3. 为 visitor_id 添加索引（提高查询性能）
CREATE INDEX IF NOT EXISTS idx_comments_visitor_id ON comments(visitor_id);

-- 4. 为编辑历史添加索引
CREATE INDEX IF NOT EXISTS idx_comment_edits_comment_id ON comment_edits(comment_id);
