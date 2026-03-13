import { D1Database } from "@cloudflare/workers-types/experimental";
import { sdkCode } from './sdk';

export interface Env {
  DB: D1Database;
  HCAPTCHA_SECRET_KEY: string;
  RESEND_API_KEY: string;
  JWT_SECRET: string;
  ADMIN_EMAIL: string;
  ADMIN_PASS: string;
  BASE_URL: string;
}

// Utility to hash password
async function hashPassword(password: string) {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Simple JWT-like implementation for Worker environment
async function createToken(payload: any, secret: string) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const data = btoa(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 86400 * 7 })); // 7 days
  const signature = await hmacSha256(header + "." + data, secret);
  return `${header}.${data}.${signature}`;
}

async function verifyToken(token: string, secret: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const signature = await hmacSha256(parts[0] + "." + parts[1], secret);
    if (signature !== parts[2]) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

async function hmacSha256(message: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function sendEmail(env: Env, to: string, subject: string, html: string, fromName: string = "ExTalk") {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <noreply@eamil.upxuu.com>`,
        to: [to],
        subject,
        html,
      }),
    });
    const data = await res.json() as any;
    if (!res.ok) {
      console.error("Resend API error:", data);
      return { success: false, error: data.message || JSON.stringify(data) };
    }
    return { success: true };
  } catch (e: any) {
    console.error("Email fetch failed:", e);
    return { success: false, error: e.message || "Network Error" };
  }
}

function domainMatches(originOrReferer: string, patterns: string[]) {
  try {
    const hostname = new URL(originOrReferer).hostname;
    return patterns.some(pattern => {
      const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      return regex.test(hostname);
    });
  } catch (e) {
    return false;
  }
}

async function getIPLocation(env: Env, ip: string) {
  try {
    const locRes = await fetch("https://whois.pconline.com.cn/ipJson.jsp?ip=" + ip + "&json=true");
    const buffer = await locRes.arrayBuffer();
    const decoder = new TextDecoder("gbk");
    const text = decoder.decode(buffer);
    const locData = JSON.parse(text);
    
    if (locData && !locData.err) {
      const admin = await env.DB.prepare("SELECT ip_display_level FROM users WHERE role = 'admin'").first() as any;
      const level = admin?.ip_display_level || "province";
      
      if (level === "city" && locData.city) {
        return locData.pro === locData.city ? locData.city : (locData.pro + locData.city);
      }
      return locData.pro || "未知属地";
    }
  } catch (e) {
    console.error("Location fetch failed:", e);
  }
  return "未知属地";
}

async function syncCommentsToAdmin(env: Env, isTest: boolean = false) {
  const admin = await env.DB.prepare("SELECT email, last_sync_at FROM users WHERE role = 'admin'").first() as any;
  if (!admin) return;

  const lastSync = isTest ? "1970-01-01 00:00:00" : admin.last_sync_at;
  const { results: comments } = await env.DB.prepare("SELECT * FROM comments WHERE created_at > ? ORDER BY created_at DESC").bind(lastSync).all();

  if (comments.length === 0 && !isTest) return;

  const html = `
    <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 12px;">
      <h2 style="color: #0070f3; border-bottom: 2px solid #f4f7ff; padding-bottom: 10px;">${isTest ? '【测试】' : ''}近期评论汇总</h2>
      <p style="color: #666; font-size: 14px;">自 ${lastSync} 以来的新评论：</p>
      ${comments.map((c: any) => `
        <div style="margin-bottom: 15px; padding: 12px; background: #f9f9f9; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <b style="color: #1a1a1a;">${c.nickname}</b>
            <span style="font-size: 12px; color: #999;">${c.created_at}</span>
          </div>
          <div style="font-size: 14px; color: #333; line-height: 1.6;">${c.content}</div>
          <div style="font-size: 11px; color: #aaa; margin-top: 8px;">页面: ${c.page_url} | IP: ${c.ip} (${c.location || '未知'})</div>
        </div>
      `).join('')}
      ${comments.length === 0 ? '<p style="text-align: center; color: #999; padding: 20px;">暂无新评论</p>' : ''}
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #999; text-align: center;">此邮件由 upxuu.com 评论系统自动发出。</p>
    </div>
  `;

  const res = await sendEmail(env, admin.email, `${isTest ? '【测试】' : ''}近期评论汇总 - upxuu`, html, "upxuu");
  if (res.success && !isTest) {
    await env.DB.prepare("UPDATE users SET last_sync_at = datetime('now', '+8 hours') WHERE role = 'admin'").run();
  }
  return res;
}

export default {
    async scheduled(event: any, env: Env, ctx: any) {
    const admin = await env.DB.prepare("SELECT sync_interval_minutes, last_sync_at FROM users WHERE role = 'admin'").first() as any;
    if (!admin || !admin.sync_interval_minutes || admin.sync_interval_minutes <= 0) return;

    // last_sync_at is stored as "YYYY-MM-DD HH:MM:SS" (Beijing)
    // To compare in UTC-based worker, we need to treat it as Beijing Time
    const lastSyncTime = new Date(admin.last_sync_at + " +0800").getTime();
    const currentTime = Date.now();
    const intervalMs = admin.sync_interval_minutes * 60 * 1000;

    if (currentTime - lastSyncTime >= intervalMs) {
      ctx.waitUntil(syncCommentsToAdmin(env));
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Page View & Like Tracking (No Auth, No Captcha)
    if (url.pathname === "/view" && request.method === "POST") {
      try {
        const { page_url, type } = await request.json() as any;
        if (!page_url) return new Response("Missing url", { status: 400, headers: corsHeaders });
        
        if (type === 'like') {
          await env.DB.prepare("INSERT INTO page_views (page_url, likes, updated_at) VALUES (?, 1, datetime('now', '+8 hours')) ON CONFLICT(page_url) DO UPDATE SET likes = likes + 1, updated_at = excluded.updated_at")
            .bind(page_url)
            .run();
        } else {
          await env.DB.prepare("INSERT INTO page_views (page_url, views, updated_at) VALUES (?, 1, datetime('now', '+8 hours')) ON CONFLICT(page_url) DO UPDATE SET views = views + 1, updated_at = excluded.updated_at")
            .bind(page_url)
            .run();
        }
        
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (e) {
        return new Response("Error", { status: 500, headers: corsHeaders });
      }
    }

    // Comment Like Tracking
    if (url.pathname === "/comment/like" && request.method === "POST") {
      try {
        const { id } = await request.json() as any;
        await env.DB.prepare("UPDATE comments SET likes = likes + 1 WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (e) {
        return new Response("Error", { status: 500, headers: corsHeaders });
      }
    }

    // Serve SDK
    if (url.pathname === '/sdk.js') {
      const sdkContent = sdkCode.replace('BASE_URL_PLACEHOLDER', url.origin);
      return new Response(sdkContent, {
        headers: { ...corsHeaders, "Content-Type": "application/javascript; charset=utf-8" },
      });
    }

    // Auth Handlers
    if (url.pathname === "/auth/register" && request.method === "POST") {
      const { email, nickname, password, hcaptcha_token } = await request.json() as any;
      
      // hCaptcha Verify
      if (hcaptcha_token) {
        const hcaptchaParams = new URLSearchParams();
        hcaptchaParams.append("secret", env.HCAPTCHA_SECRET_KEY);
        hcaptchaParams.append("response", hcaptcha_token);
        const hcaptchaRes = await fetch("https://hcaptcha.com/siteverify", { 
          method: "POST", 
          body: hcaptchaParams,
          headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });
        if (!(await hcaptchaRes.json() as any).success) return new Response(JSON.stringify({ error: "人机验证失败" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      } else {
        return new Response(JSON.stringify({ error: "缺少人机验证" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      }

      const passHash = await hashPassword(password);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        const emailResult = await sendEmail(env, email, "验证您的 upxuu.com 评论系统账户", `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #0070f3;">验证码</h2>
            <p>您好！您正在注册 <b>upxuu.com</b> 的评论系统。</p>
            <p>您的注册验证码为：</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0070f3; margin: 20px 0; background: #f4f7ff; padding: 15px; border-radius: 8px; text-align: center;">${otp}</div>
            <p>请在 10 分钟内完成验证。如果不是您本人操作，请忽略此邮件。</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 12px; color: #999;">此邮件由 upxuu.com 评论系统自动发出。</p>
          </div>
        `, "upxuu");
        
        if (!emailResult.success) {
          return new Response(JSON.stringify({ error: "邮件发送失败: " + emailResult.error }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
        }

        // Store verification info (we can reuse verification_token field to store OTP)
        await env.DB.prepare("INSERT INTO users (email, nickname, password_hash, verification_token) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET nickname=excluded.nickname, password_hash=excluded.password_hash, verification_token=excluded.verification_token, verified=0")
          .bind(email, nickname, passHash, otp)
          .run();
        
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
    }

    if (url.pathname === "/auth/verify" && request.method === "POST") {
      const { email, token } = await request.json() as any;
      const result = await env.DB.prepare("UPDATE users SET verified = 1, verification_token = NULL WHERE email = ? AND verification_token = ?")
        .bind(email, token)
        .run();
      
      if (result.meta.changes > 0) {
        return new Response("验证成功", { headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });
      } else {
        return new Response("验证码错误或已过期", { status: 400, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });
      }
    }

    if (url.pathname === "/auth/login" && request.method === "POST") {
      const { email, password, hcaptcha_token } = await request.json() as any;

      // hCaptcha Verify
      if (hcaptcha_token) {
        const hcaptchaParams = new URLSearchParams();
        hcaptchaParams.append("secret", env.HCAPTCHA_SECRET_KEY);
        hcaptchaParams.append("response", hcaptcha_token);
        const hcaptchaRes = await fetch("https://hcaptcha.com/siteverify", { 
          method: "POST", 
          body: hcaptchaParams,
          headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });
        if (!(await hcaptchaRes.json() as any).success) return new Response(JSON.stringify({ error: "人机验证失败" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      } else {
        return new Response(JSON.stringify({ error: "缺少人机验证" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      }

      const passHash = await hashPassword(password);
      const user = await env.DB.prepare("SELECT * FROM users WHERE email = ? AND password_hash = ?")
        .bind(email, passHash)
        .first() as any;
      
      if (!user) return new Response(JSON.stringify({ error: "邮箱或密码错误" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      if (!user.verified) return new Response(JSON.stringify({ error: "邮箱未验证" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });

      const token = await createToken({ id: user.id, email: user.email, role: user.role }, env.JWT_SECRET);
      return new Response(JSON.stringify({ token, nickname: user.nickname, role: user.role }), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
    }

    // Domain Validation Middleware (for POST /comments)
    if (request.method === "POST" && url.pathname === "/comments") {
       const origin = request.headers.get("Origin") || request.headers.get("Referer");
       if (!origin) return new Response("Forbidden", { status: 403, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });
       
       const { results } = await env.DB.prepare("SELECT pattern FROM allowed_domains").all();
       const patterns = results.map((r: any) => r.pattern);
       
       patterns.push("comment.upxuu.com");
       patterns.push("localhost");

       if (!domainMatches(origin, patterns)) {
         return new Response("Unauthorized Domain", { status: 403, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });
       }
    }

    // Admin Panel
    if (url.pathname === "/upxuuadmin") {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ExTalk Admin</title><style>
        :root { --primary: #0070f3; --bg: #f4f7f6; --text: #333; --card: #fff; }
        body { font-family: -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 0; }
        .sidebar { width: 220px; background: #1a1a1a; color: white; height: 100vh; position: fixed; padding: 20px; box-sizing: border-box; }
        .sidebar h2 { font-size: 1.2rem; margin-bottom: 30px; opacity: 0.8; }
        .nav-item { padding: 12px 15px; margin-bottom: 5px; cursor: pointer; border-radius: 8px; transition: 0.2s; display: flex; align-items: center; gap: 10px; }
        .nav-item:hover { background: rgba(255,255,255,0.1); }
        .nav-item.active { background: var(--primary); color: white; }
        .main { margin-left: 220px; padding: 40px; }
        .card { background: var(--card); padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 25px; }
        .card h3 { margin-top: 0; margin-bottom: 20px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 12px; border-bottom: 1px solid #eee; text-align: left; font-size: 0.9rem; }
        th { background: #fafafa; font-weight: 600; }
        button { padding: 8px 15px; cursor: pointer; border: none; border-radius: 6px; background: #eee; transition: 0.2s; }
        button.primary { background: var(--primary); color: white; }
        button.danger { background: #ff4d4f; color: white; }
        button:hover { opacity: 0.8; }
        input, select { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; outline: none; }
        .filters { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
        .url-cell { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: help; color: #666; font-size: 0.8rem; }
        .tag { font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; background: #eee; }
        .tag.blue { background: #e1efff; color: #0070f3; }
        .tag.green { background: #e6fffa; color: #38b2ac; }
      </style></head><body>
      <div class="sidebar">
        <h2>ExTalk Admin</h2>
        <div class="nav-item active" onclick="showTab('comments', this)">评论管理</div>
        <div class="nav-item" onclick="showTab('domains', this)">域名/设置</div>
        <div class="nav-item" onclick="showTab('users', this)">用户管理</div>
      </div>
      <div class="main">
        <div id="content">正在加载...</div>
      </div>
      <script>
        const API = '${url.origin}';
        const HCAPTCHA_SITE_KEY = '09063bfe-9ca4-46d6-ae94-b7486344b53a';
        let token = localStorage.getItem('extalk_admin_token');
        let currentTab = 'comments';
        let data = { comments: [], domains: [], users: [] };
        let filters = { comment: '' };
        let hcaptchaWidgetId = null;
        let isLoginMode = true;

        if (!token) {
          showLoginModal();
        } else {
          init();
        }

        function showLoginModal() {
          // 创建完整的登录界面
          const container = document.createElement('div');
          container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; z-index: 9999; font-family: -apple-system, system-ui, sans-serif;';
          
          const loginBox = document.createElement('div');
          loginBox.style.cssText = 'background: white; padding: 40px; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); width: 100%; max-width: 400px; box-sizing: border-box;';
          
          // 标题
          const title = document.createElement('h2');
          title.textContent = '管理员登录';
          title.style.cssText = 'text-align: center; margin-bottom: 30px; color: #1a1a1a; font-size: 24px; font-weight: 600;';
          
          // 邮箱输入框
          const emailLabel = document.createElement('label');
          emailLabel.textContent = '邮箱';
          emailLabel.style.cssText = 'display: block; margin-bottom: 8px; color: #4a5568; font-size: 14px; font-weight: 500;';
          
          const emailInput = document.createElement('input');
          emailInput.type = 'email';
          emailInput.id = 'admin-email';
          emailInput.placeholder = '请输入管理员邮箱';
          emailInput.style.cssText = 'width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; transition: border-color 0.2s;';
          emailInput.onfocus = () => emailInput.style.borderColor = '#0070f3';
          emailInput.onblur = () => emailInput.style.borderColor = '#e2e8f0';
          
          const emailDiv = document.createElement('div');
          emailDiv.style.cssText = 'margin-bottom: 20px;';
          emailDiv.appendChild(emailLabel);
          emailDiv.appendChild(emailInput);
          
          // 密码输入框
          const passwordLabel = document.createElement('label');
          passwordLabel.textContent = '密码';
          passwordLabel.style.cssText = 'display: block; margin-bottom: 8px; color: #4a5568; font-size: 14px; font-weight: 500;';
          
          const passwordInput = document.createElement('input');
          passwordInput.type = 'password';
          passwordInput.id = 'admin-password';
          passwordInput.placeholder = '请输入密码';
          passwordInput.style.cssText = 'width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; transition: border-color 0.2s;';
          passwordInput.onfocus = () => passwordInput.style.borderColor = '#0070f3';
          passwordInput.onblur = () => passwordInput.style.borderColor = '#e2e8f0';
          
          const passwordDiv = document.createElement('div');
          passwordDiv.style.cssText = 'margin-bottom: 20px;';
          passwordDiv.appendChild(passwordLabel);
          passwordDiv.appendChild(passwordInput);
          
          // 人机验证容器
          const captchaDiv = document.createElement('div');
          captchaDiv.id = 'hcaptcha-container';
          captchaDiv.style.cssText = 'margin-bottom: 20px; display: flex; justify-content: center;';
          
          // 登录按钮
          const loginBtn = document.createElement('button');
          loginBtn.textContent = '登录';
          loginBtn.style.cssText = 'width: 100%; padding: 12px; background: #0070f3; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background-color 0.2s;';
          loginBtn.onmouseover = () => loginBtn.style.backgroundColor = '#0056cc';
          loginBtn.onmouseout = () => loginBtn.style.backgroundColor = '#0070f3';
          
          loginBtn.onclick = async () => {
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();
            
            if (!email || !password) {
              alert('请输入邮箱和密码');
              return;
            }
            
            const hcaptchaToken = window.hcaptcha ? window.hcaptcha.getResponse(hcaptchaWidgetId) : null;
            if (!hcaptchaToken) {
              alert('请先完成人机验证');
              return;
            }
            
            loginBtn.textContent = '登录中...';
            loginBtn.disabled = true;
            
            try {
              const res = await fetch(API + '/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password, hcaptcha_token: hcaptchaToken }),
                headers: { 'Content-Type': 'application/json' }
              });
              const data = await res.json();
              
              if (res.ok && data.token && data.role === 'admin') {
                token = data.token;
                localStorage.setItem('extalk_admin_token', token);
                location.reload();
              } else {
                alert(data.error || '登录失败');
                if (window.hcaptcha) window.hcaptcha.reset(hcaptchaWidgetId);
              }
            } catch (err) {
              alert('网络错误，请重试');
            } finally {
              loginBtn.textContent = '登录';
              loginBtn.disabled = false;
            }
          };
          
          // 组装界面
          loginBox.appendChild(title);
          loginBox.appendChild(emailDiv);
          loginBox.appendChild(passwordDiv);
          loginBox.appendChild(captchaDiv);
          loginBox.appendChild(loginBtn);
          container.appendChild(loginBox);
          document.body.appendChild(container);
          
          // 加载hCaptcha
          const script = document.createElement('script');
          script.src = 'https://js.hcaptcha.com/1/api.js';
          script.async = true; script.defer = true;
          document.head.appendChild(script);
          
          script.onload = () => {
            if (window.hcaptcha) {
              hcaptchaWidgetId = window.hcaptcha.render('hcaptcha-container', { 
                sitekey: HCAPTCHA_SITE_KEY,
                theme: 'light',
                size: 'normal'
              });
            }
          };
        }



        async function req(path, method='GET', body=null) {
          const res = await fetch(API + path, {
            method,
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : null
          });
          return res.json();
        }

        async function init() {
          await loadAll();
          render();
        }

        async function loadAll() {
          [data.comments, data.domains, data.users] = await Promise.all([
            req('/admin/comments'), req('/admin/domains'), req('/admin/users')
          ]);
        }

        function showTab(tab, el) {
          currentTab = tab;
          document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
          el.classList.add('active');
          render();
        }

        function render() {
          const content = document.getElementById('content');
          if (currentTab === 'comments') renderComments(content);
          else if (currentTab === 'domains') renderDomains(content);
          else if (currentTab === 'users') renderUsers(content);
        }

        function renderComments(container) {
          const filtered = data.comments.filter(c => 
            c.nickname.toLowerCase().includes(filters.comment.toLowerCase()) || 
            c.content.toLowerCase().includes(filters.comment.toLowerCase()) ||
            c.page_url.toLowerCase().includes(filters.comment.toLowerCase())
          );
          container.innerHTML = \`
            <div class="card">
              <h3>评论管理</h3>
              <div class="filters">
                <input type="text" placeholder="搜索关键词/URL..." value="\${filters.comment}" oninput="filters.comment=this.value; renderComments(document.getElementById('content'))" style="width: 300px;">
              </div>
              <table>
                <tr><th>作者</th><th>内容</th><th>IP/属地</th><th>页面</th><th>时间</th><th>操作</th></tr>
                \${filtered.map(c => \`
                  <tr>
                    <td><b>\${escapeHtml(c.nickname)}</b></td>
                    <td style="max-width:300px">\${escapeHtml(c.content)}</td>
                    <td>\${c.ip}<br><small>\${c.location || '-'}</small></td>
                    <td class="url-cell" title="\${c.page_url}">\${c.page_url}</td>
                    <td>\${c.created_at}</td>
                    <td><button class="danger" onclick="delComment(\${c.id})">删除</button></td>
                  </tr>
                \`).join('')}
              </table>
            </div>\`;
        }

        function renderDomains(container) {
          const admin = data.users.find(u => u.role === 'admin');
          const currentLevel = admin?.ip_display_level || 'province';
          const maxLen = admin?.max_comment_length || 500;
          const syncInterval = admin?.sync_interval_minutes || 60;
          container.innerHTML = \`
            <div class="card">
              <h3>域名授权</h3>
              <div class="filters">
                <input id="new-domain" placeholder="example.com" />
                <button class="primary" onclick="addDomain()">添加授权域名</button>
              </div>
              <table>
                \${data.domains.map(d => \`<tr><td>\${d.pattern}</td><td><button class="danger" onclick="delDomain(\${d.id})">删除</button></td></tr>\`).join('')}
              </table>
            </div>
            <div class="card">
              <h3>显示设置</h3>
              <p>IP 属地显示精度：
                <select onchange="updateIpLevel(this.value)">
                  <option value="province" \${currentLevel === 'province' ? 'selected' : ''}>仅省份</option>
                  <option value="city" \${currentLevel === 'city' ? 'selected' : ''}>省份 + 城市</option>
                </select>
              </p>
              <p>单条评论最高字数：
                <input type="number" value="\${maxLen}" onchange="updateMaxLen(this.value)" style="width: 80px;">
              </p>
            </div>
            <div class="card">
              <h3>同步汇总设置</h3>
              <p>管理员通知邮箱：<b>\${admin?.email}</b></p>
              <p>同步汇总频率 (分钟，0为禁用)：
                <input type="number" value="\${syncInterval}" onchange="updateSyncInterval(this.value)" style="width: 80px;">
                <span style="font-size: 12px; color: #999; margin-left: 10px;">例如：1h2min 请输入 62</span>
              </p>
              <button class="primary" onclick="testSyncEmail()">发送同步测试邮件</button>
              <p id="sync-test-status" style="font-size: 12px; margin-top: 10px;"></p>
            </div>\`;
        }

        function renderUsers(container) {
          container.innerHTML = \`
            <div class="card">
              <h3>用户管理</h3>
              <table>
                <tr><th>ID</th><th>昵称</th><th>邮箱</th><th>角色</th><th>状态</th></tr>
                \${data.users.map(u => \`<tr><td>\${u.id}</td><td>\${u.nickname}</td><td>\${u.email}</td><td>\${u.role}</td><td><span class="tag \${u.verified?'green':''}">\${u.verified?'已验证':'未验证'}</span></td></tr>\`).join('')}
              </table>
            </div>\`;
        }

        window.updateIpLevel = async (level) => {
          await req('/admin/settings/ip-level', 'POST', { level });
          alert('设置已更新');
          init();
        };

        window.updateMaxLen = async (length) => {
          await req('/admin/settings/max-length', 'POST', { length: parseInt(length) });
          alert('设置已更新');
          init();
        };

        window.updateSyncInterval = async (interval) => {
          await req('/admin/settings/sync-interval', 'POST', { interval: parseInt(interval) });
          alert('同步设置已更新');
          init();
        };

        window.testSyncEmail = async () => {
          const status = document.getElementById('sync-test-status');
          status.innerText = '正在发送测试邮件...';
          try {
            const res = await req('/admin/settings/test-sync', 'POST');
            if (res.success) {
              status.innerText = '✅ 测试邮件已发送至管理员邮箱';
              status.style.color = 'green';
            } else {
              status.innerText = '❌ 发送失败：' + (res.error || '未知错误');
              status.style.color = 'red';
            }
          } catch (e) {
            status.innerText = '❌ 请求出错';
            status.style.color = 'red';
          }
        };

        window.addDomain = async () => {
          const pattern = document.getElementById('new-domain').value;
          if (!pattern) return;
          await req('/admin/domains', 'POST', { pattern });
          init();
        };

        window.delDomain = async (id) => { if(confirm('确定？')) { await req('/admin/domains/' + id, 'DELETE'); init(); } };
        window.delComment = async (id) => { if(confirm('确定？')) { await req('/admin/comments/' + id, 'DELETE'); init(); } };

        function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
      </script></body></html>`;

      return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
    }

    // Admin APIs
    if (url.pathname.startsWith("/admin/")) {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) return new Response("Unauthorized", { status: 401, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });
      const payload = await verifyToken(authHeader.split(" ")[1], env.JWT_SECRET);
      if (!payload || payload.role !== 'admin') return new Response("Forbidden", { status: 403, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });

      if (url.pathname === "/admin/domains" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM allowed_domains").all();
        return new Response(JSON.stringify(results), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      }
      if (url.pathname === "/admin/domains" && request.method === "POST") {
        const { pattern } = await request.json() as any;
        await env.DB.prepare("INSERT INTO allowed_domains (pattern) VALUES (?)").bind(pattern).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      }
      if (url.pathname.startsWith("/admin/domains/") && request.method === "DELETE") {
        const id = url.pathname.split("/").pop();
        await env.DB.prepare("DELETE FROM allowed_domains WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      }
      if (url.pathname === "/admin/comments" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM comments ORDER BY created_at DESC").all();
        return new Response(JSON.stringify(results), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      }
      if (url.pathname.startsWith("/admin/comments/") && request.method === "DELETE") {
        const id = url.pathname.split("/").pop();
        await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      }
      if (url.pathname === "/admin/users" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT id, nickname, email, role, verified, ip_display_level FROM users").all();
        return new Response(JSON.stringify(results), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      }
      if (url.pathname === "/admin/settings/ip-level" && request.method === "POST") {
        const { level } = await request.json() as any;
        await env.DB.prepare("UPDATE users SET ip_display_level = ? WHERE role = 'admin'").bind(level).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      }
      if (url.pathname === "/admin/settings/max-length" && request.method === "POST") {
        const { length } = await request.json() as any;
        await env.DB.prepare("UPDATE users SET max_comment_length = ? WHERE role = 'admin'").bind(length).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      }
      if (url.pathname === "/admin/settings/sync-interval" && request.method === "POST") {
        const { interval } = await request.json() as any;
        await env.DB.prepare("UPDATE users SET sync_interval_minutes = ? WHERE role = 'admin'").bind(interval).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      }
      if (url.pathname === "/admin/settings/test-sync" && request.method === "POST") {
        const result = await syncCommentsToAdmin(env, true);
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
      }
    }

    // One-time Admin Init
    if (url.pathname === "/init-admin-999") {
       try {
         const adminEmail = env.ADMIN_EMAIL || "lijiaxulove@outlook.com";
         const adminPass = env.ADMIN_PASS || "lijiaxuupxuu2011";
         const passHash = await hashPassword(adminPass);
         await env.DB.prepare("INSERT OR REPLACE INTO users (email, nickname, password_hash, role, verified, max_comment_length, sync_interval_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)")
           .bind(adminEmail, "Admin", passHash, "admin", 1, 500, 60)
           .run();
         return new Response("Admin initialized with ENV credentials", { headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });
       } catch (e: any) {
         return new Response("Error: " + e.message, { status: 500, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });
       }
    }

    // GET /comments?url=...
    if (request.method === "GET" && url.pathname === "/comments") {
      const pageUrl = url.searchParams.get("url");
      if (!pageUrl) return new Response("Missing url parameter", { status: 400, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });
      
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "6");
      const offset = (page - 1) * limit;

      // 获取当前页面的根评论（按时间降序排列，最新的在前）
      const rootCommentsRes = await env.DB.prepare("SELECT * FROM comments WHERE page_url = ? AND parent_id IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(pageUrl, limit, offset).all();
      const rootCommentsPage = rootCommentsRes.results as any[];
      
      // 获取所有评论的总数用于分页
      const totalRes = await env.DB.prepare("SELECT COUNT(*) as count FROM comments WHERE page_url = ? AND parent_id IS NULL").bind(pageUrl).first() as any;
      const total = totalRes?.count || 0;
      
      // 获取当前页面根评论的所有回复（按时间升序排列，最早的回复在前）
      const rootIdsPage = rootCommentsPage.map((c: any) => c.id);
      let replies = [];
      if (rootIdsPage.length > 0) {
        const placeholders = rootIdsPage.map(() => '?').join(',');
        const repliesRes = await env.DB.prepare(`SELECT * FROM comments WHERE page_url = ? AND parent_id IN (${placeholders}) ORDER BY created_at ASC`).bind(pageUrl, ...rootIdsPage).all();
        replies = repliesRes.results as any[];
      }
      
      const admin = await env.DB.prepare("SELECT max_comment_length FROM users WHERE role = 'admin'").first() as any;
      const maxLength = admin?.max_comment_length || 500;
      
      const viewRes = await env.DB.prepare("SELECT views, likes FROM page_views WHERE page_url = ?").bind(pageUrl).first() as any;
      const views = viewRes?.views || 0;
      const pageLikes = viewRes?.likes || 0;

      // 合并根评论和回复，根评论已经按时间降序排列
      const allComments = [...rootCommentsPage, ...replies];

      return new Response(JSON.stringify({ comments: allComments, total, max_comment_length: maxLength, views, page_likes: pageLikes }), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
    }

    // POST /comments
    if (request.method === "POST" && url.pathname === "/comments") {
      const { page_url, nickname, content, hcaptcha_token, parent_id } = await request.json() as any;
      if (!page_url || !nickname || !content || !hcaptcha_token) return new Response("Missing required fields", { status: 400, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });

      // hCaptcha Verify
      const hcaptchaParams = new URLSearchParams();
      hcaptchaParams.append("secret", env.HCAPTCHA_SECRET_KEY);
      hcaptchaParams.append("response", hcaptcha_token);
      const hcaptchaRes = await fetch("https://hcaptcha.com/siteverify", { 
        method: "POST", 
        body: hcaptchaParams,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
      if (!(await hcaptchaRes.json() as any).success) return new Response("hCaptcha failed", { status: 403, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });

      // Check max length
      const adminSetting = await env.DB.prepare("SELECT max_comment_length FROM users WHERE role = 'admin'").first() as any;
      const maxLength = adminSetting?.max_comment_length || 500;
      if (content.length > maxLength) return new Response("Content too long", { status: 400, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });

      // Get IP and Location using helper
      const ip = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
      const location = await getIPLocation(env, ip);

      // Optional Auth
      let userId = null;
      const authHeader = request.headers.get("Authorization");
      if (authHeader) {
        const payload = await verifyToken(authHeader.split(" ")[1], env.JWT_SECRET);
        if (payload) userId = payload.id;
      }

      await env.DB.prepare("INSERT INTO comments (page_url, nickname, content, parent_id, user_id, ip, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))")
        .bind(page_url, nickname, content, parent_id || null, userId, ip, location)
        .run();

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
    }

    return new Response("Not Found", { status: 404, headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } });
  },
};

