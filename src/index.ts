import { D1Database } from "@cloudflare/workers-types/experimental";

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

async function getIPLocation(env: Env, request: Request, ip: string) {
  try {
    // 优先使用 Cloudflare 内置的 IP 地理位置
    const cf = (request as any).cf;
    if (cf) {
      const admin = await env.DB.prepare("SELECT ip_display_level FROM users WHERE role = 'admin'").first() as any;
      const level = admin?.ip_display_level || "province";
      
      if (level === "city" && cf.city) {
        return cf.city + ", " + (cf.region || cf.regionCode || "");
      }
      if (cf.region) {
        return cf.region;
      }
      if (cf.regionCode) {
        return cf.regionCode;
      }
    }
    
    // 如果 Cloudflare 没有提供，回退到第三方 API
    if (ip) {
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
    if (url.pathname === "/sdk.js") {
      const baseUrl = env.BASE_URL || url.origin;
      const loadMode = env.LOAD_MODE || 'pagination'; // pagination, infinite, loadmore
      const sdkCode = `(function() {
  const SCRIPT_URL = 'https://js.hcaptcha.com/1/api.js';
  const API_ENDPOINT = '${baseUrl}';
  const HCAPTCHA_SITE_KEY = '09063bfe-9ca4-46d6-ae94-b7486344b53a';
  const LOAD_MODE = '${loadMode}'; // pagination, infinite, loadmore

  let replyingTo = null;
  let currentUser = JSON.parse(localStorage.getItem('extalk_user') || 'null');
  let currentPage = 1;
  const pageSize = 6;
  let maxCommentLength = 500;
  let hcaptchaWidgetId = null;
  let authHcaptchaWidgetId = null;
  let isLoading = false;
  let hasMorePages = true;
  let totalPages = 1;
  let currentLoadMode = LOAD_MODE;
  let observer = null;
  let loadMoreBtn = null;
  
  // 点赞防抖：记录正在点赞的评论 ID
  const likingComments = new Set();

  const styles = \`
    #extalk-comments {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #333;
      max-width: 800px;
      margin: 20px auto;
    }
    .comment-form {
      padding: 0;
      margin-bottom: 30px;
      display: none; /* Collapsed by default */
      opacity: 0;
      transform: translateY(-20px);
      transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      max-height: 0;
      overflow: hidden;
    }
    .comment-form.expanded {
      display: block;
      opacity: 1;
      transform: translateY(0);
      max-height: 500px;
    }
    .form-toggle-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #0070f3;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      margin-bottom: 20px;
      padding: 8px 12px;
      border-radius: 10px;
      background: rgba(0, 112, 243, 0.05);
      width: fit-content;
      transition: all 0.2s;
    }
    .form-toggle-btn:hover {
      background: rgba(0, 112, 243, 0.1);
    }
    .form-title {
      margin: 0 0 15px 0;
      color: #0070f3;
      font-size: 1.1rem;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .close-form-btn {
      font-size: 0.85rem;
      color: #94a3b8;
      cursor: pointer;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 6px;
      transition: all 0.2s;
    }
    .close-form-btn:hover {
      background: rgba(0, 0, 0, 0.05);
      color: #64748b;
    }
    .auth-btn {
      font-size: 0.85rem;
      color: #0070f3;
      cursor: pointer;
      font-weight: 500;
      background: rgba(0, 112, 243, 0.08);
      padding: 6px 12px;
      border-radius: 8px;
      transition: all 0.2s;
    }
    .auth-btn:hover {
      background: rgba(0, 112, 243, 0.15);
    }
    .input-group {
      margin-bottom: 16px;
    }
    .comment-input {
      width: 100%;
      padding: 12px;
      border: 1px solid rgba(0, 112, 243, 0.1);
      border-radius: 10px;
      box-sizing: border-box;
      transition: all 0.2s;
      outline: none;
      font-size: 0.95rem;
      background: rgba(0, 112, 243, 0.02);
    }
    .comment-input:focus {
      border-color: #0070f3;
      background: white;
    }
    .submit-btn {
      background: #0070f3;
      color: white;
      border: none;
      padding: 12px 28px;
      border-radius: 12px;
      cursor: pointer;
      font-weight: 700;
      transition: all 0.2s;
      box-shadow: 0 4px 12px rgba(0, 112, 243, 0.3);
    }
    .submit-btn:hover {
      background: #0060d9;
      transform: translateY(-1px);
      box-shadow: 0 6px 15px rgba(0, 112, 243, 0.4);
    }
    .submit-btn:active {
      transform: translateY(0);
    }
    .submit-btn:disabled {
      background: #a0cfff;
      cursor: not-allowed;
      box-shadow: none;
    }
    .views-info {
      display: flex;
      align-items: center;
      gap: 12px;
      color: #64748b;
      font-size: 0.85rem;
      margin-bottom: 15px;
      padding: 0 5px;
    }
    .views-info-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .views-info-item.clickable {
      cursor: pointer;
      transition: color 0.2s;
    }
    .views-info-item.clickable:hover {
      color: #e11d48;
    }
    .views-info-item.liked {
      color: #e11d48;
    }
    .views-info svg {
      width: 16px;
      height: 16px;
      opacity: 0.7;
    }
    .views-info-item.liked svg {
      fill: currentColor;
      opacity: 1;
    }
    .comment-item {
      padding: 15px 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      margin-bottom: 0;
      opacity: 0;
      transform: translateX(-50px) translateY(50px);
      transition: all 0.8s cubic-bezier(0.23, 1, 0.32, 1);
    }
    .comment-item.animate-in {
      opacity: 1;
      transform: translateX(0) translateY(0);
    }
    // 评论滑出视口后重新进入时从右侧滑入
    .comment-item.animate-out {
      opacity: 0;
      transform: translateX(100px) translateY(0);
      transition: all 0.6s cubic-bezier(0.23, 1, 0.32, 1);
    }
    .comment-item.animate-out.animate-in {
      opacity: 1;
      transform: translateX(0) translateY(0);
    }
    .comment-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .comment-author {
      font-weight: 700;
      color: #1a1a1a;
      font-size: 1.05rem;
    }
    .comment-meta {
      font-size: 0.85rem;
      color: #94a3b8;
    }
    .comment-content {
      line-height: 1.7;
      word-break: break-all;
      color: #334155;
      font-size: 1rem;
    }
    .comment-footer {
      margin-top: 15px;
      display: flex;
      gap: 15px;
      font-size: 0.9rem;
    }
    .reply-btn { color: #0070f3; cursor: pointer; font-weight: 600; }
    .like-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #64748b;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.2s;
      user-select: none;
      font-weight: 600;
    }
    .like-btn:hover {
      color: #e11d48;
    }
    .like-btn.liked {
      color: #e11d48;
    }
    .like-btn svg {
      width: 16px;
      height: 16px;
    }
    .like-btn.liked svg {
      fill: currentColor;
    }
    .del-btn { color: #ef4444; cursor: pointer; font-weight: 600; }
    .reply-target {
      background: #f1f5f9;
      border-left: 4px solid #0070f3;
      padding: 10px 15px;
      margin-bottom: 15px;
      font-size: 0.95rem;
      color: #475569;
      border-radius: 4px 12px 12px 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .replies-container {
      margin-left: 0;
      margin-top: 5px;
    }
    .floor-tag {
      background: #e1efff;
      color: #0070f3;
      padding: 3px 10px;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 800;
      margin-left: 8px;
    }
    .location-tag {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-left: 10px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .modal {
      display: none;
      position: fixed;
      z-index: 1000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.4);
      backdrop-filter: blur(4px);
    }
    .modal-content {
      background-color: white;
      margin: 10% auto;
      padding: 30px;
      width: 360px;
      border-radius: 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }
    .modal-title {
      font-size: 1.5rem;
      font-weight: 800;
      margin-bottom: 25px;
      text-align: center;
      color: #1e293b;
    }
    .pagination {
      display: flex;
      justify-content: center;
      gap: 10px;
      margin-top: 30px;
    }
    .page-btn {
      padding: 8px 16px;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
      background: white;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }
    .page-btn:hover {
      border-color: #0070f3;
      color: #0070f3;
    }
    .page-btn.active {
      background: #0070f3;
      color: white;
      border-color: #0070f3;
    }
    .load-more-btn {
      display: block;
      width: 100%;
      padding: 12px;
      margin: 20px 0;
      background: #f0f9ff;
      color: #0070f3;
      border: 2px solid #0070f3;
      border-radius: 12px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }
    .load-more-btn:hover {
      background: #0070f3;
      color: white;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 112, 243, 0.2);
    }
    .load-more-btn:disabled {
      background: #f1f5f9;
      color: #94a3b8;
      border-color: #e2e8f0;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    .otp-group {
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-bottom: 20px;
    }
    .otp-input {
      width: 45px;
      height: 55px;
      text-align: center;
      font-size: 1.5rem;
      font-weight: 700;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      outline: none;
    }
    .otp-input:focus {
      border-color: #0070f3;
    }
  \`;

  function init() {
    const container = document.getElementById('extalk-comments');
    if (!container) return;

    // 支持通过 URL 参数覆盖加载模式
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');
    if (modeParam && ['pagination', 'infinite', 'loadmore'].includes(modeParam)) {
      currentLoadMode = modeParam;
    }

    const styleTag = document.createElement('style');
    styleTag.textContent = styles;
    document.head.appendChild(styleTag);

    renderApp(container);
    loadComments();
  }

  function renderApp(container) {
    container.innerHTML = \`
      <div id="views-counter" class="views-info"></div>
      <div id="form-toggle" class="form-toggle-btn">
        <svg style="width:18px;height:18px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
        <span>点击发送评论</span>
      </div>
      <div id="comment-form-container" class="comment-form">
        <div class="form-title">
          <div style="display:flex; align-items:center; gap:10px">
            <span id="form-title">发表评论</span>
            <span id="close-form" class="close-form-btn">收起</span>
          </div>
          <span class="auth-btn" id="auth-status-btn">登录/注册</span>
        </div>
        <div id="reply-info"></div>
        <div class="input-group">
          <input type="text" id="comment-nickname" class="comment-input" placeholder="您的昵称" required />
        </div>
        <div class="input-group">
          <textarea id="comment-content" class="comment-input" style="height: 120px; resize: vertical;" placeholder="写下你的想法..." required></textarea>
        </div>
        <div id="hcaptcha-container" style="margin-bottom: 15px;"></div>
        <button id="submit-comment" class="submit-btn">发布评论</button>
      </div>
      <div id="comments-list">正在加载评论...</div>
      <div id="pagination-container" class="pagination"></div>
      
      <div id="auth-modal" class="modal">
        <div class="modal-content">
          <div class="modal-title" id="modal-title">登录</div>
          <div id="auth-main-form">
            <div class="input-group"><input type="email" id="auth-email" class="comment-input" placeholder="电子邮箱" /></div>
            <div class="input-group"><input type="password" id="auth-password" class="comment-input" placeholder="密码" /></div>
            <div class="input-group" id="nickname-group" style="display:none;"><input type="text" id="auth-nickname" class="comment-input" placeholder="用户昵称" /></div>
            <div id="auth-hcaptcha-container" style="margin-bottom: 15px;"></div>
            <button id="auth-submit" class="submit-btn" style="width:100%; margin-top:10px;">下一步</button>
            <p style="font-size:0.9rem; text-align:center; margin-top:20px; color: #64748b;">
              <span id="auth-toggle-text">还没有账号？</span>
              <a href="javascript:void(0)" id="auth-toggle" style="color: #0070f3; text-decoration: none; font-weight: 600;">立即注册</a>
            </p>
          </div>
          <div id="auth-otp-form" style="display:none;">
            <p style="text-align:center; margin-bottom:20px; color: #64748b; font-size: 0.9rem;">验证码已发送至您的邮箱，请查收</p>
            <div class="otp-group">
              <input type="text" maxlength="1" class="otp-input" />
              <input type="text" maxlength="1" class="otp-input" />
              <input type="text" maxlength="1" class="otp-input" />
              <input type="text" maxlength="1" class="otp-input" />
              <input type="text" maxlength="1" class="otp-input" />
              <input type="text" maxlength="1" class="otp-input" />
            </div>
            <button id="otp-submit" class="submit-btn" style="width:100%">验证并注册</button>
            <p style="text-align:center; margin-top:20px;"><a href="javascript:void(0)" id="otp-back" style="color: #64748b; font-size: 0.85rem;">返回修改信息</a></p>
          </div>
        </div>
      </div>
    \`;

    updateAuthUI();

    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true; script.defer = true;
    document.head.appendChild(script);

    script.onload = () => {
      if (window.hcaptcha) {
        hcaptchaWidgetId = window.hcaptcha.render('hcaptcha-container', { sitekey: HCAPTCHA_SITE_KEY });
        authHcaptchaWidgetId = window.hcaptcha.render('auth-hcaptcha-container', { sitekey: HCAPTCHA_SITE_KEY });
      }
    };

    document.getElementById('form-toggle').onclick = () => {
      const form = document.getElementById('comment-form-container');
      form.classList.add('expanded');
      document.getElementById('form-toggle').style.display = 'none';
      
      // 延迟触发动画
      setTimeout(() => {
        form.style.display = 'block';
      }, 10);
    };

    document.getElementById('close-form').onclick = () => {
      const form = document.getElementById('comment-form-container');
      form.classList.remove('expanded');
      
      // 等待动画完成后隐藏
      setTimeout(() => {
        form.style.display = 'none';
        document.getElementById('form-toggle').style.display = 'flex';
        window.cancelReply();
      }, 400);
    };

    document.getElementById('submit-comment').onclick = submitComment;
    document.getElementById('auth-status-btn').onclick = () => {
      if (currentUser) {
        if(confirm('确定登出当前账户？')) {
           localStorage.removeItem('extalk_user');
           currentUser = null;
           updateAuthUI();
           loadComments();
        }
      } else {
        document.getElementById('auth-modal').style.display = 'block';
        resetAuthModal();
      }
    };

    window.onclick = (e) => {
      if (e.target == document.getElementById('auth-modal')) document.getElementById('auth-modal').style.display = 'none';
    };

    let isLogin = true;
    const authToggle = document.getElementById('auth-toggle');
    authToggle.onclick = () => {
      isLogin = !isLogin;
      document.getElementById('modal-title').innerText = isLogin ? '登录' : '注册新账号';
      document.getElementById('nickname-group').style.display = isLogin ? 'none' : 'block';
      document.getElementById('auth-toggle-text').innerText = isLogin ? '还没有账号？' : '已有账号？';
      authToggle.innerText = isLogin ? '立即注册' : '返回登录';
      document.getElementById('auth-submit').innerText = isLogin ? '登录' : '发送验证码';
    };

    function resetAuthModal() {
      isLogin = true;
      document.getElementById('modal-title').innerText = '登录';
      document.getElementById('nickname-group').style.display = 'none';
      document.getElementById('auth-toggle-text').innerText = '还没有账号？';
      authToggle.innerText = '立即注册';
      document.getElementById('auth-submit').innerText = '登录';
      document.getElementById('auth-main-form').style.display = 'block';
      document.getElementById('auth-otp-form').style.display = 'none';
      if (window.hcaptcha && authHcaptchaWidgetId !== null) {
        window.hcaptcha.reset(authHcaptchaWidgetId);
      }
    }

    // OTP inputs focus logic
    const otpInputs = document.querySelectorAll('.otp-input');
    otpInputs.forEach((input, idx) => {
      input.oninput = (e) => {
        if (e.target.value && idx < otpInputs.length - 1) otpInputs[idx + 1].focus();
      };
      input.onkeydown = (e) => {
        if (e.key === 'Backspace' && !e.target.value && idx > 0) otpInputs[idx - 1].focus();
      };
    });

    document.getElementById('otp-back').onclick = () => {
      document.getElementById('auth-main-form').style.display = 'block';
      document.getElementById('auth-otp-form').style.display = 'none';
    };

    document.getElementById('auth-submit').onclick = async () => {
      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;
      const nickname = document.getElementById('auth-nickname').value;
      
      let hcaptchaToken = null;
      if (window.hcaptcha && authHcaptchaWidgetId !== null) {
        hcaptchaToken = window.hcaptcha.getResponse(authHcaptchaWidgetId);
      }

      if (!hcaptchaToken) return alert('请先完成人机验证');

      if (isLogin) {
        try {
          const res = await fetch(\`\${API_ENDPOINT}/auth/login\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, hcaptcha_token: hcaptchaToken })
          });
          const data = await res.json();
          if (res.ok) {
            currentUser = data;
            localStorage.setItem('extalk_user', JSON.stringify(data));
            document.getElementById('auth-modal').style.display = 'none';
            updateAuthUI();
            loadComments();
          } else { 
            alert(data.error || '登录失败'); 
            if (window.hcaptcha) window.hcaptcha.reset(authHcaptchaWidgetId);
          }
        } catch (err) { alert('网络错误'); }
      } else {
        // Register - send OTP
        try {
          const res = await fetch(\`\${API_ENDPOINT}/auth/register\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, nickname, password, hcaptcha_token: hcaptchaToken })
          });
          const data = await res.json();
          if (res.ok) {
            document.getElementById('auth-main-form').style.display = 'none';
            document.getElementById('auth-otp-form').style.display = 'block';
          } else { 
            alert(data.error || '注册失败'); 
            if (window.hcaptcha) window.hcaptcha.reset(authHcaptchaWidgetId);
          }
        } catch (err) { alert('网络错误'); }
      }
    };

    document.getElementById('otp-submit').onclick = async () => {
      const email = document.getElementById('auth-email').value;
      const otp = Array.from(otpInputs).map(i => i.value).join('');
      if (otp.length !== 6) return alert('请输入6位验证码');

      try {
        const res = await fetch(\`\${API_ENDPOINT}/auth/verify\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token: otp })
        });
        if (res.ok) {
          alert('验证成功，请登录');
          resetAuthModal();
        } else {
          alert(await res.text() || '验证失败');
        }
      } catch (err) { alert('网络错误'); }
    };
  }

  function updateAuthUI() {
    const btn = document.getElementById('auth-status-btn');
    const nickInput = document.getElementById('comment-nickname');
    if (currentUser) {
      btn.innerText = \`已登录: \${currentUser.nickname}\`;
      nickInput.value = currentUser.nickname;
      nickInput.disabled = true;
    } else {
      btn.innerText = '登录/注册';
      nickInput.value = '';
      nickInput.disabled = false;
    }
  }

  async function loadComments() {
    const listContainer = document.getElementById('comments-list');
    const pageUrl = window.location.pathname;
    
    // 重置透明度，确保新评论可见
    if (listContainer) {
      listContainer.style.opacity = '1';
      listContainer.style.transition = 'none';
    }
    
    // Track page view
    fetch(\`\${API_ENDPOINT}/view\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_url: pageUrl })
    }).catch(() => {});

    try {
      const response = await fetch(\`\${API_ENDPOINT}/comments?url=\${encodeURIComponent(pageUrl)}&page=\${currentPage}&limit=\${pageSize}\`);
      const data = await response.json();
      const allComments = data.comments;
      const total = data.total;
      const views = data.views || 0;
      const pageLikes = data.page_likes || 0;
      maxCommentLength = data.max_comment_length || 500;
      
      const viewsCounter = document.getElementById('views-counter');
      if (viewsCounter) {
        viewsCounter.innerHTML = \`
          <div class="views-info-item">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
            <span>\${views} 次浏览</span>
          </div>
          <div class="views-info-item">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
            <span>\${total} 条评论</span>
          </div>
          <div id="page-like-btn" class="views-info-item clickable \${localStorage.getItem('liked_page_' + pageUrl) ? 'liked' : ''}">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
            <span id="page-likes-count">\${pageLikes}</span>
          </div>
        \`;
        document.getElementById('page-like-btn').onclick = () => window.likePage(pageUrl);
      }
      
      const contentInput = document.getElementById('comment-content');
      if (contentInput) contentInput.placeholder = \`写下你的想法... (最多 \${maxCommentLength} 字)\`;
      
      if (allComments.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 60px 0;"><svg style="width: 48px; height: 48px; margin-bottom: 15px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg><p>暂无评论，快来分享你的见解吧！</p></div>';
        document.getElementById('pagination-container').innerHTML = '';
        return;
      }
      
      const rootComments = allComments.filter(c => !c.parent_id);
      const replies = allComments.filter(c => c.parent_id);
      const isAdmin = currentUser && currentUser.role === 'admin';

      function renderComment(c, level = 0) {
        const commentReplies = replies.filter(r => r.parent_id === c.id);
        const delBtnHtml = isAdmin ? \`<span class="del-btn" onclick="window.delComment(\${c.id})">删除</span>\` : '';
        // 楼层计算：由于根评论按时间降序排列（最新的在前），楼层号需要从大到小
        const floorNumber = total - ((currentPage - 1) * pageSize + rootComments.indexOf(c));
        const floorHtml = level === 0 ? \`<span class="floor-tag">\${floorNumber}F</span>\` : '';
        const locationHtml = c.location ? \`<span class="location-tag"><svg style="width:12px;height:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>\${escapeHtml(c.location)}</span>\` : '';
        const timeStr = c.created_at;
        const liked = localStorage.getItem('liked_comment_' + c.id);
        
        return \`
          <div class="comment-item" style="\${level > 0 ? 'margin-top: 5px; border: none; padding: 10px 0 10px 20px; border-left: 2px solid rgba(0, 112, 243, 0.1);' : ''}">
            <div class="comment-header">
              <div><span class="comment-author" style="\${level > 0 ? 'font-size: 0.95rem;' : ''}">\${escapeHtml(c.nickname)}</span>\${floorHtml}\${locationHtml}</div>
              <span class="comment-meta">\${timeStr}</span>
            </div>
            <div class="comment-content" style="\${level > 0 ? 'font-size: 0.95rem;' : ''}">\${escapeHtml(c.content)}</div>
            <div class="comment-footer" style="margin-top:10px; display:flex; gap:15px; align-items:center;">
              <div class="like-btn \${liked ? 'liked' : ''}" onclick="window.likeComment(\${c.id}, this)">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                <span class="like-count">\${c.likes || 0}</span>
              </div>
              <a href="javascript:void(0)" class="reply-btn" style="font-size:0.85rem; text-decoration:none;" onclick="window.setReply(\${c.id}, '\${escapeHtml(c.nickname)}')">回复</a>
              \${delBtnHtml}
            </div>
            \${commentReplies.length > 0 ? \`
              <div class="replies-container">
                \${commentReplies.map(r => renderComment(r, level + 1)).join('')}
              </div>
            \` : ''}
          </div>\`;
      }

      listContainer.innerHTML = rootComments.map(c => renderComment(c)).join('');
      renderPagination(total);
      
      // 添加滚动监听动画 - 一次只有一个评论项滑出，从上到下依次渲染
      // 无限滚动模式除外，它的动画在 loadNextPage 中处理
      if (currentLoadMode === 'infinite') {
        // 无限滚动模式：第一页评论立即显示，不需要动画
        setTimeout(() => {
          const commentItems = Array.from(listContainer.querySelectorAll('.comment-item'));
          commentItems.forEach(item => {
            item.classList.add('animate-in');
          });
        }, 10);
      } else {
        // 其他模式：使用 Intersection Observer 逐个触发动画，并监听滑出滑入
        setTimeout(() => {
          const commentItems = Array.from(listContainer.querySelectorAll('.comment-item'));
          let currentIndex = 0;
          
          const initialObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting && currentIndex < commentItems.length) {
                // 只触发当前索引的评论项动画
                const currentItem = commentItems[currentIndex];
                if (currentItem && currentItem === entry.target) {
                  currentItem.classList.add('animate-in');
                  currentIndex++;
                  initialObserver.unobserve(currentItem);
                  
                  // 观察下一个评论项
                  if (currentIndex < commentItems.length) {
                    initialObserver.observe(commentItems[currentIndex]);
                  }
                }
              }
            });
          }, {
            threshold: 0.3,
            rootMargin: '0px 0px -100px 0px'
          });
          
          // 从第一个评论项开始观察
          if (commentItems.length > 0) {
            initialObserver.observe(commentItems[0]);
          }
          
          // 为所有评论添加滑出滑入监听
          setupCommentReanimate(commentItems);
        }, 100);
      }
    } catch (err) { console.error(err); }
  }

  function renderPagination(total) {
    totalPages = Math.ceil(total / pageSize);
    hasMorePages = currentPage < totalPages;
    const container = document.getElementById('pagination-container');
    
    // 根据加载模式渲染不同的 UI
    if (currentLoadMode === 'pagination') {
      // 传统分页模式
      if (totalPages <= 1) {
        container.innerHTML = '';
        return;
      }
      let html = '';
      for (let i = 1; i <= totalPages; i++) {
        html += \`<button class="page-btn \${i === currentPage ? 'active' : ''}" onclick="window.changePage(\${i})">\${i}</button>\`;
      }
      container.innerHTML = html;
    } else if (currentLoadMode === 'infinite') {
      // 无限滚动模式 - 不需要分页控件
      container.innerHTML = '';
      // 设置滚动监听
      setupInfiniteScroll();
    } else if (currentLoadMode === 'loadmore') {
      // 加载更多模式
      if (!hasMorePages) {
        container.innerHTML = '<div style="text-align:center; padding: 20px; color: #94a3b8;">没有更多评论了</div>';
      } else {
        container.innerHTML = \`
          <button id="load-more-btn" class="load-more-btn" onclick="window.loadMore()">
            加载更多评论
          </button>
        \`;
      }
    }
  }

  // 无限滚动加载
  let infiniteScrollInitialized = false;
  
  function setupInfiniteScroll() {
    // 避免重复初始化
    if (infiniteScrollInitialized) return;
    infiniteScrollInitialized = true;
    
    // 清理旧的观察者
    if (observer) {
      observer.disconnect();
    }
    
    // 移除旧的 sentinel 元素
    const oldSentinel = document.getElementById('sentinel');
    if (oldSentinel) {
      oldSentinel.remove();
    }
    
    // 创建加载状态提示元素
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'infinite-loading';
    loadingDiv.style.cssText = 'text-align: center; padding: 20px; color: #94a3b8; display: none;';
    loadingDiv.innerHTML = '<p>加载中...</p>';
    document.getElementById('comments-list').appendChild(loadingDiv);
    
    // 监听最后一个评论元素，而不是固定的 sentinel
    observeLastComment();
  }
  
  // 监听最后一个评论元素
  function observeLastComment() {
    if (observer) {
      observer.disconnect();
    }
    
    const listContainer = document.getElementById('comments-list');
    const commentItems = listContainer.querySelectorAll('.comment-item');
    
    if (commentItems.length === 0) {
      // 如果没有评论，设置定时器重试
      setTimeout(() => observeLastComment(), 100);
      return;
    }
    
    // 监听最后一个评论元素
    const lastComment = commentItems[commentItems.length - 1];
    
    observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMorePages && !isLoading) {
        loadNextPage();
      }
    }, {
      root: null,
      rootMargin: '100px',
      threshold: 0.1
    });
    
    observer.observe(lastComment);
  }
  
  // 为评论添加滑出滑入监听 - 所有模式通用
  function setupCommentReanimate(commentItems) {
    const reanimateObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const item = entry.target;
        if (entry.isIntersecting) {
          // 进入视口：如果之前标记为滑出，则从右侧滑入
          if (item.classList.contains('animate-out')) {
            item.classList.add('animate-in');
          }
        } else {
          // 离开视口：标记为滑出状态
          item.classList.add('animate-out');
          item.classList.remove('animate-in');
        }
      });
    }, {
      root: null,
      rootMargin: '-100px',  // 提前 100px 标记为滑出
      threshold: 0
    });
    
    commentItems.forEach(item => {
      reanimateObserver.observe(item);
    });
  }

  // 加载更多按钮模式
  window.loadMore = function() {
    if (isLoading || !hasMorePages) return;
    
    const btn = document.getElementById('load-more-btn');
    if (btn) {
      btn.textContent = '加载中...';
      btn.disabled = true;
    }
    
    loadNextPage();
  };

  // 加载下一页
  async function loadNextPage() {
    if (isLoading || !hasMorePages) return;
    
    isLoading = true;
    currentPage++;
    
    // 延迟显示加载状态（2 秒后如果还没加载完才显示）
    const loadingDiv = document.getElementById('infinite-loading');
    let loadingTimer = null;
    if (loadingDiv) {
      loadingTimer = setTimeout(() => {
        if (isLoading) {
          loadingDiv.style.display = 'block';
        }
      }, 2000);
    }
    
    try {
      const pageUrl = window.location.pathname;
      const response = await fetch(\`\${API_ENDPOINT}/comments?url=\${encodeURIComponent(pageUrl)}&page=\${currentPage}&limit=\${pageSize}\`);
      const data = await response.json();
      const newComments = data.comments;
      
      if (newComments.length === 0) {
        hasMorePages = false;
        isLoading = false;
        if (loadingTimer) clearTimeout(loadingTimer);
        if (loadingDiv) {
          loadingDiv.style.display = 'none';
        }
        return;
      }
      
      const rootComments = newComments.filter(c => !c.parent_id);
      const replies = newComments.filter(c => c.parent_id);
      const isAdmin = currentUser && currentUser.role === 'admin';
      const total = data.total;
      
      function renderComment(c, level = 0) {
        const commentReplies = replies.filter(r => r.parent_id === c.id);
        const delBtnHtml = isAdmin ? \`<span class="del-btn" onclick="window.delComment(\${c.id})">删除</span>\` : '';
        const floorNumber = total - ((currentPage - 1) * pageSize + rootComments.indexOf(c));
        const floorHtml = level === 0 ? \`<span class="floor-tag">\${floorNumber}F</span>\` : '';
        const locationHtml = c.location ? \`<span class="location-tag"><svg style="width:12px;height:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>\${escapeHtml(c.location)}</span>\` : '';
        const timeStr = c.created_at;
        const liked = localStorage.getItem('liked_comment_' + c.id);
        
        return \`
          <div class="comment-item" style="\${level > 0 ? 'margin-top: 5px; border: none; padding: 10px 0 10px 20px; border-left: 2px solid rgba(0, 112, 243, 0.1);' : ''}">
            <div class="comment-header">
              <div><span class="comment-author" style="\${level > 0 ? 'font-size: 0.95rem;' : ''}">\${escapeHtml(c.nickname)}</span>\${floorHtml}\${locationHtml}</div>
              <span class="comment-meta">\${timeStr}</span>
            </div>
            <div class="comment-content" style="\${level > 0 ? 'font-size: 0.95rem;' : ''}">\${escapeHtml(c.content)}</div>
            <div class="comment-footer" style="margin-top:10px; display:flex; gap:15px; align-items:center;">
              <div class="like-btn \${liked ? 'liked' : ''}" onclick="window.likeComment(\${c.id}, this)">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                <span class="like-count">\${c.likes || 0}</span>
              </div>
              <a href="javascript:void(0)" class="reply-btn" style="font-size:0.85rem; text-decoration:none;" onclick="window.setReply(\${c.id}, '\${escapeHtml(c.nickname)}')">回复</a>
              \${delBtnHtml}
            </div>
            \${commentReplies.length > 0 ? \`
              <div class="replies-container">
                \${commentReplies.map(r => renderComment(r, level + 1)).join('')}
              </div>
            \` : ''}
          </div>\`;
      }
      
      const listContainer = document.getElementById('comments-list');
      const newHtml = rootComments.map(c => renderComment(c)).join('');
      listContainer.insertAdjacentHTML('beforeend', newHtml);
      
      // 新评论的滚动动画 - 无限滚动模式下逐个显示
      if (currentLoadMode === 'infinite') {
        setTimeout(() => {
          const allItems = listContainer.querySelectorAll('.comment-item');
          const startIndex = allItems.length - rootComments.length;
          
          // 只对新加载的评论应用动画
          for (let i = startIndex; i < allItems.length; i++) {
            allItems[i].classList.remove('animate-in');
          }
          
          // 使用 Intersection Observer 逐个触发动画
          let currentIndex = startIndex;
          const infiniteObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting && currentIndex < allItems.length) {
                const currentItem = allItems[currentIndex];
                if (currentItem === entry.target) {
                  currentItem.classList.add('animate-in');
                  currentIndex++;
                  infiniteObserver.unobserve(currentItem);
                  
                  // 观察下一个评论项
                  if (currentIndex < allItems.length) {
                    infiniteObserver.observe(allItems[currentIndex]);
                  }
                }
              }
            });
          }, {
            threshold: 0.3,
            rootMargin: '0px 0px -100px 0px'
          });
          
          // 从第一个新评论项开始观察
          if (currentIndex < allItems.length) {
            infiniteObserver.observe(allItems[currentIndex]);
          }
          
          // 为新评论添加滑出滑入监听
          const newItems = Array.from(allItems).slice(startIndex);
          setupCommentReanimate(newItems);
        }, 100);
      } else {
        // 其他模式保持原有动画逻辑
        setTimeout(() => {
          const newItems = listContainer.querySelectorAll('.comment-item');
          const startIndex = newItems.length - rootComments.length;
          for (let i = startIndex; i < newItems.length; i++) {
            newItems[i].classList.add('animate-in');
          }
        }, 100);
      }
      
      hasMorePages = currentPage < totalPages;
      
      // 更新加载更多按钮状态
      if (currentLoadMode === 'loadmore') {
        renderPagination(total);
      }
      
      // 无限滚动模式下，重新监听最后一个评论
      if (currentLoadMode === 'infinite' && hasMorePages) {
        setTimeout(() => {
          observeLastComment();
        }, 200);
      }
      
    } catch (err) {
      console.error('Load more failed:', err);
      currentPage--; // 回滚页码
    } finally {
      isLoading = false;
      // 清除定时器并隐藏加载状态
      const loadingDiv = document.getElementById('infinite-loading');
      if (loadingTimer) clearTimeout(loadingTimer);
      if (loadingDiv) {
        loadingDiv.style.display = 'none';
      }
      if (currentLoadMode === 'loadmore') {
        const btn = document.getElementById('load-more-btn');
        if (btn) {
          btn.textContent = '加载更多评论';
          btn.disabled = false;
        }
      }
    }
  }

  window.changePage = function(page) {
    currentPage = page;
    
    // 添加分页切换过渡效果
    const commentsContainer = document.getElementById('extalk-comments');
    const listContainer = document.getElementById('comments-list');
    
    // 先淡出现有评论
    if (listContainer) {
      listContainer.style.opacity = '0';
      listContainer.style.transition = 'opacity 0.3s ease';
    }
    
    setTimeout(() => {
      loadComments();
      
      // 加载完成后淡入新评论
      setTimeout(() => {
        if (listContainer) {
          listContainer.style.opacity = '1';
        }
        commentsContainer.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }, 300);
  };

  window.setReply = function(id, nickname) {
    replyingTo = id;
    const form = document.getElementById('comment-form-container');
    form.classList.add('expanded');
    document.getElementById('form-toggle').style.display = 'none';
    
    // 延迟触发动画
    setTimeout(() => {
      form.style.display = 'block';
    }, 10);
    
    document.getElementById('form-title').innerText = '回复评论';
    document.getElementById('reply-info').innerHTML = \`
      <div class="reply-target">
        <span>回复 @\${nickname}</span>
        <svg onclick="window.cancelReply()" style="width:18px;height:18px;cursor:pointer;color:#ef4444" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </div>\`;
    document.getElementById('comment-content').focus();
    document.getElementById('extalk-comments').scrollIntoView({ behavior: 'smooth' });
  };

  window.cancelReply = function() {
    replyingTo = null;
    document.getElementById('reply-info').innerHTML = '';
    document.getElementById('form-title').innerText = '发表评论';
  };

  window.likeComment = async (id, btn) => {
    // 防抖：如果已经点过赞或正在点赞，直接返回
    if (localStorage.getItem('liked_comment_' + id) || likingComments.has(id)) {
      return;
    }
    
    // 标记为正在点赞
    likingComments.add(id);
    
    try {
      const res = await fetch(\`\${API_ENDPOINT}/comment/like\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      
      if (res.ok) {
        localStorage.setItem('liked_comment_' + id, 'true');
        btn.classList.add('liked');
        const countSpan = btn.querySelector('.like-count');
        countSpan.innerText = parseInt(countSpan.innerText) + 1;
      }
    } catch(e) {
      console.error('Like failed:', e);
    } finally {
      // 移除点赞标记
      likingComments.delete(id);
    }
  };

  window.likePage = async (pageUrl) => {
    // 防抖：如果已经点过赞或正在点赞，直接返回
    if (localStorage.getItem('liked_page_' + pageUrl) || likingComments.has('page_' + pageUrl)) {
      return;
    }
    
    // 标记为正在点赞
    likingComments.add('page_' + pageUrl);
    
    try {
      const res = await fetch(\`\${API_ENDPOINT}/view\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_url: pageUrl, type: 'like' })
      });
      
      if (res.ok) {
        localStorage.setItem('liked_page_' + pageUrl, 'true');
        const btn = document.getElementById('page-like-btn');
        btn.classList.add('liked');
        const countSpan = document.getElementById('page-likes-count');
        countSpan.innerText = parseInt(countSpan.innerText) + 1;
      }
    } catch(e) {
      console.error('Page like failed:', e);
    } finally {
      // 移除点赞标记
      likingComments.delete('page_' + pageUrl);
    }
  };

  window.delComment = async function(id) {
    if(!confirm('确定永久删除此评论？')) return;
    try {
      const res = await fetch(\`\${API_ENDPOINT}/admin/comments/\${id}\`, {
        method: 'DELETE',
        headers: { 'Authorization': \`Bearer \${currentUser.token}\` }
      });
      if(res.ok) loadComments();
      else alert('删除失败：' + await res.text());
    } catch(e) { alert('请求失败'); }
  };

  async function submitComment() {
    const contentInput = document.getElementById('comment-content');
    const content = contentInput.value.trim();
    const nickname = document.getElementById('comment-nickname').value.trim();
    
    let hcaptchaToken = null;
    if (window.hcaptcha && hcaptchaWidgetId !== null) {
      hcaptchaToken = window.hcaptcha.getResponse(hcaptchaWidgetId);
    } else {
      hcaptchaToken = document.querySelector('[name="h-captcha-response"]')?.value;
    }
    
    if (!content || !nickname || !hcaptchaToken) return alert('请填写完整昵称、内容并完成人机验证');
    if (content.length > maxCommentLength) return alert(\`评论内容过长，不能超过 \${maxCommentLength} 个字符\`);
    const submitBtn = document.getElementById('submit-comment');
    submitBtn.disabled = true; submitBtn.innerText = '正在发布...';
    try {
      const res = await fetch(\`\${API_ENDPOINT}/comments\`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': currentUser ? \`Bearer \${currentUser.token}\` : ''
        },
        body: JSON.stringify({
          page_url: window.location.pathname,
          nickname, content, hcaptcha_token: hcaptchaToken, parent_id: replyingTo
        })
      });
      
      if (res.ok) {
        contentInput.value = '';
        cancelReply();
        if (window.hcaptcha && hcaptchaWidgetId !== null) {
          window.hcaptcha.reset(hcaptchaWidgetId);
        }
        // 重置到第一页并重新加载所有评论
        currentPage = 1;
        hasMorePages = true;
        totalPages = 1;
        infiniteScrollInitialized = false; // 重置无限滚动初始化标志
        
        // 清理旧的观察者
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        
        // 移除 sentinel 元素
        const oldSentinel = document.getElementById('sentinel');
        if (oldSentinel) {
          oldSentinel.remove();
        }
        
        // 移除加载状态提示
        const oldLoading = document.getElementById('infinite-loading');
        if (oldLoading) {
          oldLoading.remove();
        }
        
        loadComments();
      } else { 
        const errorText = await res.text();
        alert('提交失败：' + errorText); 
      }
    } catch (err) { 
      console.error('Submit error:', err);
      alert('网络请求出错，请稍后重试'); 
    }
    finally { submitBtn.disabled = false; submitBtn.innerText = '发布评论'; }
  }

  function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();`;
      return new Response(sdkCode, {
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

      // 使用 CTE 优化查询（5 次 → 3 次）
      // 1. 获取根评论和回复
      const rootCommentsRes = await env.DB.prepare(
        `SELECT * FROM comments 
         WHERE page_url = ? AND parent_id IS NULL 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`
      ).bind(pageUrl, limit, offset).all();
      const rootCommentsPage = rootCommentsRes.results as any[];
      
      // 2. 获取回复（使用 IN 子查询）
      let replies = [];
      if (rootCommentsPage.length > 0) {
        const rootIds = rootCommentsPage.map((c: any) => c.id);
        const placeholders = rootIds.map(() => '?').join(',');
        const repliesRes = await env.DB.prepare(
          `SELECT * FROM comments 
           WHERE page_url = ? AND parent_id IN (${placeholders}) 
           ORDER BY created_at ASC`
        ).bind(pageUrl, ...rootIds).all();
        replies = repliesRes.results as any[];
      }
      
      // 3. 使用计数缓存表（O(1) 查询）
      const countRes = await env.DB.prepare(
        `SELECT root_count as count FROM comment_counts WHERE page_url = ?`
      ).bind(pageUrl).first() as any;
      const total = countRes?.count || 0;
      
      // 4. 页面统计和管理员设置（合并为 1 次查询）
      const statsRes = await env.DB.prepare(
        `SELECT 
           COALESCE(pv.views, 0) as views,
           COALESCE(pv.likes, 0) as likes,
           COALESCE(u.max_comment_length, 500) as max_comment_length
         FROM page_views pv
         CROSS JOIN (SELECT max_comment_length FROM users WHERE role = 'admin' LIMIT 1) u
         WHERE pv.page_url = ?`
      ).bind(pageUrl).first() as any;
      
      const views = statsRes?.views || 0;
      const pageLikes = statsRes?.likes || 0;
      const maxLength = statsRes?.max_comment_length || 500;

      return new Response(JSON.stringify({ 
        comments: [...rootCommentsPage, ...replies], 
        total, 
        max_comment_length: maxLength, 
        views, 
        page_likes: pageLikes 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
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
      const location = await getIPLocation(env, request, ip);

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

