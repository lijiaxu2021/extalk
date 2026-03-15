-- Letalk Forum Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    nickname TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT DEFAULT '',
    signature TEXT DEFAULT '',
    role TEXT DEFAULT 'user', -- user, moderator, admin
    verified INTEGER DEFAULT 0,
    verification_token TEXT,
    status TEXT DEFAULT 'active', -- active, banned
    ban_reason TEXT DEFAULT '',
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    ip_display_level TEXT DEFAULT 'province', -- province, city
    max_comment_length INTEGER DEFAULT 500,
    sync_interval_minutes INTEGER DEFAULT 60,
    last_sync_at TEXT,
    created_at TEXT DEFAULT (datetime('now', '+8 hours')),
    updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
);

-- Categories table (main categories)
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '',
    display_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', '+8 hours'))
);

-- Boards table (sub-boards)
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '',
    slug TEXT UNIQUE NOT NULL,
    display_order INTEGER DEFAULT 0,
    thread_count INTEGER DEFAULT 0,
    post_count INTEGER DEFAULT 0,
    last_thread_id INTEGER,
    last_post_at TEXT,
    status TEXT DEFAULT 'active', -- active, hidden
    created_at TEXT DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Threads table (topics)
CREATE TABLE IF NOT EXISTS threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'active', -- active, locked, hidden, deleted
    is_pinned INTEGER DEFAULT 0,
    is_featured INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    post_count INTEGER DEFAULT 0,
    last_post_id INTEGER,
    last_post_at TEXT,
    tags TEXT DEFAULT '', -- comma-separated tags
    created_at TEXT DEFAULT (datetime('now', '+8 hours')),
    updated_at TEXT DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Posts table (replies)
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    parent_id INTEGER, -- for nested replies
    content TEXT NOT NULL,
    status TEXT DEFAULT 'active', -- active, deleted
    like_count INTEGER DEFAULT 0,
    floor_number INTEGER,
    ip TEXT,
    location TEXT,
    created_at TEXT DEFAULT (datetime('now', '+8 hours')),
    updated_at TEXT DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- reply, mention, like, system
    title TEXT NOT NULL,
    content TEXT,
    related_user_id INTEGER,
    related_thread_id INTEGER,
    related_post_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (related_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (related_thread_id) REFERENCES threads(id) ON DELETE SET NULL,
    FOREIGN KEY (related_post_id) REFERENCES posts(id) ON DELETE SET NULL
);

-- Favorites table
CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    thread_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    UNIQUE(user_id, thread_id)
);

-- Likes table (for threads and posts)
CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    thread_id INTEGER,
    post_id INTEGER,
    created_at TEXT DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    UNIQUE(user_id, thread_id, post_id)
);

-- User profiles table (extended user info)
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY,
    bio TEXT DEFAULT '',
    website TEXT DEFAULT '',
    company TEXT DEFAULT '',
    location TEXT DEFAULT '',
    social_links TEXT DEFAULT '{}', -- JSON format
    theme_preference TEXT DEFAULT 'light',
    notification_settings TEXT DEFAULT '{}', -- JSON format
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Admin logs table
CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT, -- user, thread, post, board
    target_id INTEGER,
    details TEXT,
    ip TEXT,
    created_at TEXT DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Allowed domains table (for CORS)
CREATE TABLE IF NOT EXISTS allowed_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_threads_board_id ON threads(board_id);
CREATE INDEX IF NOT EXISTS idx_threads_user_id ON threads(user_id);
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);
CREATE INDEX IF NOT EXISTS idx_threads_created_at ON threads(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_thread_id ON posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_parent_id ON posts(parent_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);
CREATE INDEX IF NOT EXISTS idx_boards_category_id ON boards(category_id);

-- Insert default admin user (password: admin123)
-- The password hash will be generated by the application
INSERT OR IGNORE INTO users (email, nickname, password_hash, role, verified, level) 
VALUES ('admin@letalk.com', 'Admin', '', 'admin', 1, 10);

-- Insert default categories
INSERT INTO categories (name, description, icon, display_order) VALUES
('综合讨论区', '在这里进行各种话题的讨论', '💬', 1),
('技术交流区', '编程、技术分享', '💻', 2),
('生活娱乐区', '休闲、娱乐、灌水', '🎮', 3);

-- Insert default boards
INSERT INTO boards (category_id, name, description, slug, display_order) VALUES
(1, '灌水区', '随便聊聊', 'water-cooler', 1),
(1, '建议反馈', '对论坛的建议', 'feedback', 2),
(2, '前端开发', 'HTML/CSS/JavaScript 等技术讨论', 'frontend', 1),
(2, '后端开发', 'Java/Python/Node.js 等技术讨论', 'backend', 2),
(3, '闲聊灌水', '轻松话题', 'off-topic', 1);
