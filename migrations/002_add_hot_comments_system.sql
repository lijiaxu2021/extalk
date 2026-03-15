-- 热评系统迁移脚本

-- 1. 为评论添加热度分数字段（用于缓存计算结果）
ALTER TABLE comments ADD COLUMN heat_score REAL DEFAULT 0;

-- 2. 为热度分数添加索引（提高排序性能）
CREATE INDEX IF NOT EXISTS idx_comments_heat_score ON comments(page_url, heat_score DESC);

-- 3. 为点赞数添加索引（提高热度计算性能）
CREATE INDEX IF NOT EXISTS idx_comments_likes ON comments(page_url, likes DESC);

-- 4. 创建热度计算配置表
CREATE TABLE IF NOT EXISTS heat_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  like_weight REAL DEFAULT 1.0,        -- 点赞权重
  reply_weight REAL DEFAULT 2.0,       -- 回复权重
  time_decay_factor REAL DEFAULT 0.5,  -- 时间衰减因子
  updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
);

-- 5. 初始化默认配置
INSERT INTO heat_settings (like_weight, reply_weight, time_decay_factor) VALUES (1.0, 2.0, 0.5);
