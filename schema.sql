CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  nickname TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user', -- 'admin' or 'user'
  verified INTEGER DEFAULT 0,
  verification_token TEXT,
  ip_display_level TEXT DEFAULT 'province', -- 'province' or 'city'
  max_comment_length INTEGER DEFAULT 500,
  sync_interval_minutes INTEGER DEFAULT 60, -- minutes, 0 means disabled
  last_sync_at DATETIME DEFAULT (datetime('now', '+8 hours')),
  created_at DATETIME DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS allowed_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT UNIQUE NOT NULL, -- e.g. 'upxuu.com', '*.upxuu.com'
  created_at DATETIME DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_url TEXT NOT NULL,
  nickname TEXT NOT NULL,
  content TEXT NOT NULL,
  parent_id INTEGER DEFAULT NULL,
  user_id INTEGER DEFAULT NULL, -- NULL if guest
  ip TEXT,
  location TEXT,
  created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
  FOREIGN KEY(parent_id) REFERENCES comments(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_comments_page_url ON comments(page_url);

CREATE TABLE IF NOT EXISTS page_views (
  page_url TEXT PRIMARY KEY,
  views INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT (datetime('now', '+8 hours'))
);
