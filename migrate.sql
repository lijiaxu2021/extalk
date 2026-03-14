-- Extalk 数据库性能优化迁移脚本
-- 创建时间：2026-03-14
-- 目标：极致性能，极致低的 D1 数据库查询次数

-- ========================================
-- 第一阶段：索引优化
-- ========================================

-- 1. 复合索引：覆盖 page_url + parent_id 查询
CREATE INDEX IF NOT EXISTS idx_comments_page_parent 
ON comments(page_url, parent_id);

-- 2. 部分索引：加速根评论按时间排序（只索引根评论）
CREATE INDEX IF NOT EXISTS idx_comments_page_root_created 
ON comments(page_url, created_at DESC) 
WHERE parent_id IS NULL;

-- 3. 部分索引：加速回复查询（只索引回复）
CREATE INDEX IF NOT EXISTS idx_comments_parent_created 
ON comments(parent_id, created_at ASC) 
WHERE parent_id IS NOT NULL;

-- ========================================
-- 第二阶段：计数缓存表
-- ========================================

-- 创建计数缓存表
CREATE TABLE IF NOT EXISTS comment_counts (
  page_url TEXT PRIMARY KEY,
  root_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  updated_at DATETIME
);

-- ========================================
-- 第三阶段：触发器自动维护计数
-- ========================================

-- 删除旧的触发器（如果存在）
DROP TRIGGER IF EXISTS trg_comment_count_insert;
DROP TRIGGER IF EXISTS trg_comment_count_delete;

-- 插入评论时自动更新计数
CREATE TRIGGER trg_comment_count_insert
AFTER INSERT ON comments
BEGIN
  INSERT INTO comment_counts (page_url, root_count, reply_count, updated_at)
  VALUES (
    NEW.page_url,
    CASE WHEN NEW.parent_id IS NULL THEN 1 ELSE 0 END,
    CASE WHEN NEW.parent_id IS NOT NULL THEN 1 ELSE 0 END,
    datetime('now', '+8 hours')
  )
  ON CONFLICT(page_url) DO UPDATE SET
    root_count = comment_counts.root_count + 
      CASE WHEN NEW.parent_id IS NULL THEN 1 ELSE 0 END,
    reply_count = comment_counts.reply_count + 
      CASE WHEN NEW.parent_id IS NOT NULL THEN 1 ELSE 0 END,
    updated_at = datetime('now', '+8 hours');
END;

-- 删除评论时自动更新计数
CREATE TRIGGER trg_comment_count_delete
AFTER DELETE ON comments
BEGIN
  UPDATE comment_counts SET
    root_count = root_count - CASE WHEN OLD.parent_id IS NULL THEN 1 ELSE 0 END,
    reply_count = reply_count - CASE WHEN OLD.parent_id IS NOT NULL THEN 1 ELSE 0 END,
    updated_at = datetime('now', '+8 hours')
  WHERE page_url = OLD.page_url;
END;

-- ========================================
-- 第四阶段：初始化现有数据
-- ========================================

-- 为现有页面初始化计数
INSERT OR REPLACE INTO comment_counts (page_url, root_count, reply_count, updated_at)
SELECT 
  page_url,
  SUM(CASE WHEN parent_id IS NULL THEN 1 ELSE 0 END),
  SUM(CASE WHEN parent_id IS NOT NULL THEN 1 ELSE 0 END),
  datetime('now', '+8 hours')
FROM comments
GROUP BY page_url;

-- ========================================
-- 优化完成
-- ========================================
