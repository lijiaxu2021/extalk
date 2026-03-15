import { D1Database } from "@cloudflare/workers-types/experimental";

export interface Env {
  DB: D1Database;
  HCAPTCHA_SECRET_KEY: string;
  HCAPTCHA_SITE_KEY: string;
  RESEND_API_KEY: string;
  JWT_SECRET: string;
  ADMIN_EMAIL: string;
  ADMIN_PASS: string;
  BASE_URL: string;
  FORUM_NAME: string;
}

// Import utilities
import { hashPassword, createToken, verifyToken } from "./utils/jwt";
import { sendEmail, generateOTP } from "./utils/email";

// Import API handlers
import { handleAuth } from "./api/auth";
import { handleUsers } from "./api/users";
import { handleBoards } from "./api/boards";
import { handleThreads } from "./api/threads";
import { handlePosts } from "./api/posts";
import { handleAdmin } from "./api/admin";

// CORS headers helper
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    
    try {
      // Auth routes
      if (path.startsWith("/api/auth/")) {
        return handleAuth(request, env);
      }
      
      // User routes
      if (path.startsWith("/api/users")) {
        const user = await getUserFromAuth(env, request.headers.get("Authorization"));
        if (!user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { 
            status: 401, 
            headers: { ...corsHeaders(), "Content-Type": "application/json" } 
          });
        }
        return handleUsers(request, env, user);
      }
      
      // Board routes
      if (path.startsWith("/api/boards")) {
        return handleBoards(request, env);
      }
      
      // Thread routes
      if (path.startsWith("/api/threads")) {
        const user = await getUserFromAuth(env, request.headers.get("Authorization"));
        return handleThreads(request, env, user);
      }
      
      // Post routes
      if (path.startsWith("/api/posts")) {
        const user = await getUserFromAuth(env, request.headers.get("Authorization"));
        return handlePosts(request, env, user);
      }
      
      // Admin routes
      if (path.startsWith("/api/admin/")) {
        const user = await getUserFromAuth(env, request.headers.get("Authorization"));
        if (!user || user.role !== "admin") {
          return new Response(JSON.stringify({ error: "Forbidden" }), { 
            status: 403, 
            headers: { ...corsHeaders(), "Content-Type": "application/json" } 
          });
        }
        return handleAdmin(request, env, user);
      }
      
      // Serve frontend pages
      if (path === "/" || path === "/index.html") {
        return servePage("index");
      }
      if (path === "/login.html" || path === "/login") {
        return servePage("login");
      }
      if (path === "/register.html" || path === "/register") {
        return servePage("register");
      }
      if (path === "/boards.html" || path === "/boards") {
        return servePage("boards");
      }
      
      // Static assets - serve from GitHub raw or CDN
      if (path.startsWith("/assets/")) {
        return serveAsset(path);
      }
      
      // API 404
      if (path.startsWith("/api/")) {
        return new Response(JSON.stringify({ error: "API Not Found" }), { 
          status: 404, 
          headers: { ...corsHeaders(), "Content-Type": "application/json" } 
        });
      }
      
      // Page 404
      return new Response("Not Found", { 
        status: 404, 
        headers: { ...corsHeaders(), "Content-Type": "text/plain" } 
      });
      
    } catch (e: any) {
      console.error("Error:", e);
      return new Response(JSON.stringify({ error: e.message || "Internal Server Error" }), { 
        status: 500, 
        headers: { ...corsHeaders(), "Content-Type": "application/json" } 
      });
    }
  },
};

// Get user from auth header
async function getUserFromAuth(env: Env, authHeader: string | null): Promise<any | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  
  const token = authHeader.split(" ")[1];
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload) return null;
  
  const user = await env.DB.prepare("SELECT id, email, nickname, role, avatar_url FROM users WHERE id = ?")
    .bind(payload.id)
    .first() as any;
  
  return user;
}

// Serve HTML pages
function servePage(page: string): Response {
  const pages: Record<string, string> = {
    index: getIndexHTML(),
    login: getLoginHTML(),
    register: getRegisterHTML(),
    boards: getBoardsHTML()
  };
  
  const html = pages[page] || "<h1>404 Not Found</h1>";
  
  return new Response(html, {
    headers: { 
      "Content-Type": "text/html; charset=utf-8",
      ...corsHeaders()
    }
  });
}

// Serve static assets from raw GitHub
async function serveAsset(path: string): Promise<Response> {
  const rawUrl = `https://raw.githubusercontent.com/lijiaxulove/letalk/main${path}`;
  
  try {
    const res = await fetch(rawUrl);
    if (!res.ok) {
      return new Response("Asset not found", { status: 404 });
    }
    
    let contentType = "text/plain";
    if (path.endsWith(".css")) {
      contentType = "text/css";
    } else if (path.endsWith(".js")) {
      contentType = "application/javascript";
    }
    
    const content = await res.text();
    
    return new Response(content, {
      headers: { 
        "Content-Type": contentType,
        ...corsHeaders()
      }
    });
  } catch (e) {
    return new Response("Error loading asset", { status: 500 });
  }
}

// HTML Page Functions
function getIndexHTML(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Letalk 论坛 - 首页</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/lijiaxulove/letalk@main/frontend/assets/css/style.css">
</head>
<body>
    <header class="header">
        <div class="container">
            <div class="header-content">
                <a href="/" class="logo">Letalk</a>
                <nav class="nav">
                    <a href="/boards.html">板块</a>
                    <a href="/latest.html">最新</a>
                    <a href="/hot.html">热门</a>
                </nav>
                <div class="auth-buttons" id="auth-buttons"></div>
            </div>
        </div>
    </header>

    <main class="main">
        <div class="container">
            <section class="hero">
                <h1>欢迎来到 Letalk 论坛</h1>
                <p>一个现代化的交流平台，分享你的想法和见解</p>
                <div class="hero-actions">
                    <a href="/register.html" class="btn btn-primary">立即加入</a>
                    <a href="/boards.html" class="btn btn-secondary">浏览板块</a>
                </div>
            </section>

            <section class="stats">
                <div class="stat-item">
                    <div class="stat-number" id="stat-threads">0</div>
                    <div class="stat-label">主题</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number" id="stat-posts">0</div>
                    <div class="stat-label">帖子</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number" id="stat-users">0</div>
                    <div class="stat-label">用户</div>
                </div>
            </section>

            <section id="boards" class="boards-section">
                <h2 class="section-title">论坛板块</h2>
                <div id="boards-list" class="boards-list">
                    <div class="loading">加载中...</div>
                </div>
            </section>
        </div>
    </main>

    <footer class="footer">
        <div class="container">
            <div class="footer-bottom">
                <p>&copy; 2024 Letalk Forum. All rights reserved.</p>
            </div>
        </div>
    </footer>

    <script src="https://cdn.jsdelivr.net/gh/lijiaxulove/letalk@main/frontend/assets/js/app.js"></script>
    <script>
        async function loadBoards() {
            try {
                const res = await fetch('/api/boards');
                const data = await res.json();
                const container = document.getElementById('boards-list');
                
                if (data.categories && data.categories.length > 0) {
                    container.innerHTML = data.categories.map(cat => \`
                        <div class="category">
                            <div class="category-header">
                                <span class="category-icon">\${cat.icon || '📁'}</span>
                                <h3 class="category-name">\${cat.name}</h3>
                                <span class="category-desc">\${cat.description || ''}</span>
                            </div>
                            <div class="category-boards">
                                \${cat.boards.map(board => \`
                                    <a href="/board.html?slug=\${board.slug}" class="board-card">
                                        <div class="board-icon">\${board.icon || '💬'}</div>
                                        <div class="board-info">
                                            <h4 class="board-name">\${board.name}</h4>
                                            <p class="board-desc">\${board.description || '暂无描述'}</p>
                                        </div>
                                    </a>
                                \`).join('')}
                            </div>
                        </div>
                    \`).join('');
                }
            } catch (e) {
                console.error('Failed to load boards:', e);
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            loadBoards();
            updateAuthUI();
        });
    </script>
</body>
</html>`;
}

function getLoginHTML(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>登录 - Letalk 论坛</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/lijiaxulove/letalk@main/frontend/assets/css/style.css">
    <style>
        .auth-page { min-height: calc(100vh - 200px); display: flex; align-items: center; justify-content: center; padding: 40px 20px; }
        .auth-card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 100%; max-width: 420px; }
        .auth-title { font-size: 28px; font-weight: 700; text-align: center; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; color: #6b7280; font-size: 14px; }
        .form-input { width: 100%; padding: 12px 15px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 15px; outline: none; transition: all 0.2s; }
        .form-input:focus { border-color: #0070f3; }
        .submit-btn { width: 100%; padding: 14px; background: #0070f3; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .submit-btn:hover { background: #0060d9; transform: translateY(-2px); }
        .submit-btn:disabled { background: #a0cfff; cursor: not-allowed; }
        .auth-footer { text-align: center; margin-top: 25px; color: #6b7280; font-size: 14px; }
        .auth-footer a { color: #0070f3; text-decoration: none; font-weight: 600; }
    </style>
</head>
<body>
    <header class="header">
        <div class="container">
            <div class="header-content">
                <a href="/" class="logo">Letalk</a>
                <nav class="nav">
                    <a href="/">首页</a>
                    <a href="/boards.html">板块</a>
                </nav>
            </div>
        </div>
    </header>

    <div class="auth-page">
        <div class="auth-card">
            <h1 class="auth-title">登录</h1>
            <form id="login-form">
                <div class="form-group">
                    <label for="email">邮箱</label>
                    <input type="email" id="email" class="form-input" placeholder="请输入邮箱" required>
                </div>
                <div class="form-group">
                    <label for="password">密码</label>
                    <input type="password" id="password" class="form-input" placeholder="请输入密码" required>
                </div>
                <button type="submit" class="submit-btn" id="submit-btn">登录</button>
            </form>
            <div class="auth-footer">
                还没有账号？<a href="/register.html">立即注册</a>
            </div>
        </div>
    </div>

    <script>
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const submitBtn = document.getElementById('submit-btn');
            
            submitBtn.disabled = true;
            submitBtn.textContent = '登录中...';
            
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, hcaptcha_token: 'test' })
                });
                
                const data = await res.json();
                
                if (res.ok) {
                    localStorage.setItem('letalk_user', JSON.stringify(data.user));
                    alert('登录成功!');
                    window.location.href = '/';
                } else {
                    alert(data.error || '登录失败');
                }
            } catch (err) {
                alert('网络错误，请稍后重试');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = '登录';
            }
        });
    </script>
</body>
</html>`;
}

function getRegisterHTML(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>注册 - Letalk 论坛</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/lijiaxulove/letalk@main/frontend/assets/css/style.css">
    <style>
        .auth-page { min-height: calc(100vh - 200px); display: flex; align-items: center; justify-content: center; padding: 40px 20px; }
        .auth-card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 100%; max-width: 420px; }
        .auth-title { font-size: 28px; font-weight: 700; text-align: center; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; color: #6b7280; font-size: 14px; }
        .form-input { width: 100%; padding: 12px 15px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 15px; outline: none; }
        .form-input:focus { border-color: #0070f3; }
        .submit-btn { width: 100%; padding: 14px; background: #0070f3; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
        .submit-btn:hover { background: #0060d9; }
        .auth-footer { text-align: center; margin-top: 25px; color: #6b7280; font-size: 14px; }
        .auth-footer a { color: #0070f3; text-decoration: none; font-weight: 600; }
    </style>
</head>
<body>
    <header class="header">
        <div class="container">
            <div class="header-content">
                <a href="/" class="logo">Letalk</a>
                <nav class="nav">
                    <a href="/">首页</a>
                    <a href="/boards.html">板块</a>
                </nav>
            </div>
        </div>
    </header>

    <div class="auth-page">
        <div class="auth-card">
            <h1 class="auth-title">注册新账号</h1>
            <form id="register-form">
                <div class="form-group">
                    <label for="nickname">昵称</label>
                    <input type="text" id="nickname" class="form-input" placeholder="请输入昵称" required>
                </div>
                <div class="form-group">
                    <label for="email">邮箱</label>
                    <input type="email" id="email" class="form-input" placeholder="请输入邮箱" required>
                </div>
                <div class="form-group">
                    <label for="password">密码</label>
                    <input type="password" id="password" class="form-input" placeholder="请输入密码" required minlength="6">
                </div>
                <button type="submit" class="submit-btn">注册</button>
            </form>
            <div class="auth-footer">
                已有账号？<a href="/login.html">立即登录</a>
            </div>
        </div>
    </div>

    <script>
        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const nickname = document.getElementById('nickname').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nickname, email, password, hcaptcha_token: 'test' })
                });
                
                const data = await res.json();
                
                if (res.ok) {
                    alert('注册成功！请登录');
                    window.location.href = '/login.html';
                } else {
                    alert(data.error || '注册失败');
                }
            } catch (err) {
                alert('网络错误，请稍后重试');
            }
        });
    </script>
</body>
</html>`;
}

function getBoardsHTML(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>论坛板块 - Letalk</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/lijiaxulove/letalk@main/frontend/assets/css/style.css">
</head>
<body>
    <header class="header">
        <div class="container">
            <div class="header-content">
                <a href="/" class="logo">Letalk</a>
                <nav class="nav">
                    <a href="/">首页</a>
                    <a href="/boards.html">板块</a>
                </nav>
                <div class="auth-buttons" id="auth-buttons"></div>
            </div>
        </div>
    </header>

    <main class="main">
        <div class="container">
            <section class="boards-section">
                <h2 class="section-title">论坛板块</h2>
                <div id="boards-list" class="boards-list">
                    <div class="loading">加载中...</div>
                </div>
            </section>
        </div>
    </main>

    <script src="https://cdn.jsdelivr.net/gh/lijiaxulove/letalk@main/frontend/assets/js/app.js"></script>
    <script>
        async function loadBoards() {
            try {
                const res = await fetch('/api/boards');
                const data = await res.json();
                const container = document.getElementById('boards-list');
                
                if (data.categories && data.categories.length > 0) {
                    container.innerHTML = data.categories.map(cat => \`
                        <div class="category">
                            <div class="category-header">
                                <span class="category-icon">\${cat.icon || '📁'}</span>
                                <h3 class="category-name">\${cat.name}</h3>
                            </div>
                            <div class="category-boards">
                                \${cat.boards.map(board => \`
                                    <a href="/board.html?slug=\${board.slug}" class="board-card">
                                        <div class="board-icon">\${board.icon || '💬'}</div>
                                        <div class="board-info">
                                            <h4 class="board-name">\${board.name}</h4>
                                            <p class="board-desc">\${board.description || '暂无描述'}</p>
                                        </div>
                                    </a>
                                \`).join('')}
                            </div>
                        </div>
                    \`).join('');
                }
            } catch (e) {
                console.error('Failed to load boards:', e);
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            loadBoards();
            updateAuthUI();
        });
    </script>
</body>
</html>`;
}
