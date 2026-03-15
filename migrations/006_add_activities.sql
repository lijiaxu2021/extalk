-- 创建活动表
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  template TEXT NOT NULL,
  label_color TEXT DEFAULT '#0070f3',
  start_time TEXT,
  end_time TEXT,
  target_date TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now', '+8 hours')),
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- 创建活动参与表
CREATE TABLE IF NOT EXISTS activity_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  comment_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now', '+8 hours')),
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_activities_is_active ON activities(is_active);
CREATE INDEX IF NOT EXISTS idx_activities_created_by ON activities(created_by);
CREATE INDEX IF NOT EXISTS idx_activity_comments_activity_id ON activity_comments(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_comments_comment_id ON activity_comments(comment_id);
