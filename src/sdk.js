(function() {
  const SCRIPT_URL = 'https://js.hcaptcha.com/1/api.js';
  const API_ENDPOINT = '${baseUrl}';
  const HCAPTCHA_SITE_KEY = '09063bfe-9ca4-46d6-ae94-b7486344b53a';

  let replyingTo = null;
  let currentUser = JSON.parse(localStorage.getItem('extalk_user') || 'null');
  let currentPage = 1;
  const pageSize = 6;
  let maxCommentLength = 500;
  let hcaptchaWidgetId = null;
  let authHcaptchaWidgetId = null;

  const styles = `
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
  `;

  function init() {
    const container = document.getElementById('extalk-comments');
    if (!container) return;

    const styleTag = document.createElement('style');
    styleTag.textContent = styles;
    document.head.appendChild(styleTag);

    renderApp(container);
    loadComments();
  }

  function renderApp(container) {
    container.innerHTML = `
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
    `;

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
  const res = await fetch(`${API_ENDPOINT}/auth/login`, {
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
  const res = await fetch(`${API_ENDPOINT}/auth/register`, {
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
const res = await fetch(`${API_ENDPOINT}/auth/verify`, {
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
      btn.innerText = `已登录: ${currentUser.nickname}`;
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
    fetch(`${API_ENDPOINT}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_url: pageUrl })
    }).catch(() => {});

    try {
      const response = await fetch(`${API_ENDPOINT}/comments?url=${encodeURIComponent(pageUrl)}&page=${currentPage}&limit=${pageSize}`);
      const data = await response.json();
      const allComments = data.comments;
      const total = data.total;
      const views = data.views || 0;
      const pageLikes = data.page_likes || 0;
      maxCommentLength = data.max_comment_length || 500;
      
      const viewsCounter = document.getElementById('views-counter');
      if (viewsCounter) {
viewsCounter.innerHTML = `
  <div class="views-info-item">
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
    <span>${views} 次浏览</span>
  </div>
  <div class="views-info-item">
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
    <span>${total} 条评论</span>
  </div>
  <div id="page-like-btn" class="views-info-item clickable ${localStorage.getItem('liked_page_' + pageUrl) ? 'liked' : ''}">
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
    <span id="page-likes-count">${pageLikes}</span>
  </div>
`;
document.getElementById('page-like-btn').onclick = () => window.likePage(pageUrl);
      }
      
      const contentInput = document.getElementById('comment-content');
      if (contentInput) contentInput.placeholder = `写下你的想法... (最多 ${maxCommentLength} 字)`;
      
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
const delBtnHtml = isAdmin ? `<span class="del-btn" onclick="window.delComment(${c.id})">删除</span>` : '';
// 楼层计算：由于根评论按时间降序排列（最新的在前），楼层号需要从大到小
const floorNumber = total - ((currentPage - 1) * pageSize + rootComments.indexOf(c));
const floorHtml = level === 0 ? `<span class="floor-tag">${floorNumber}F</span>` : '';
const locationHtml = c.location ? `<span class="location-tag"><svg style="width:12px;height:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>${escapeHtml(c.location)}</span>` : '';
const timeStr = c.created_at;
const liked = localStorage.getItem('liked_comment_' + c.id);

return `
  <div class="comment-item" style="${level > 0 ? 'margin-top: 5px; border: none; padding: 10px 0 10px 20px; border-left: 2px solid rgba(0, 112, 243, 0.1);' : ''}">
    <div class="comment-header">
      <div><span class="comment-author" style="${level > 0 ? 'font-size: 0.95rem;' : ''}">${escapeHtml(c.nickname)}</span>${floorHtml}${locationHtml}</div>
      <span class="comment-meta">${timeStr}</span>
    </div>
    <div class="comment-content" style="${level > 0 ? 'font-size: 0.95rem;' : ''}">${escapeHtml(c.content)}</div>
    <div class="comment-footer" style="margin-top:10px; display:flex; gap:15px; align-items:center;">
      <div class="like-btn ${liked ? 'liked' : ''}" onclick="window.likeComment(${c.id}, this)">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
        <span class="like-count">${c.likes || 0}</span>
      </div>
      <a href="javascript:void(0)" class="reply-btn" style="font-size:0.85rem; text-decoration:none;" onclick="window.setReply(${c.id}, '${escapeHtml(c.nickname)}')">回复</a>
      ${delBtnHtml}
    </div>
    ${commentReplies.length > 0 ? `
      <div class="replies-container">
        ${commentReplies.map(r => renderComment(r, level + 1)).join('')}
      </div>
    ` : ''}
  </div>`;
      }

      listContainer.innerHTML = rootComments.map(c => renderComment(c)).join('');
      renderPagination(total);
      
      // 添加滚动监听动画 - 一次只有一个评论项滑出，从上到下依次渲染
      setTimeout(() => {
const commentItems = Array.from(listContainer.querySelectorAll('.comment-item'));
let currentIndex = 0;

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && currentIndex < commentItems.length) {
      // 只触发当前索引的评论项动画
      const currentItem = commentItems[currentIndex];
      if (currentItem && currentItem === entry.target) {
        currentItem.classList.add('animate-in');
        currentIndex++;
        observer.unobserve(currentItem);
        
        // 观察下一个评论项
        if (currentIndex < commentItems.length) {
          observer.observe(commentItems[currentIndex]);
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
  observer.observe(commentItems[0]);
}
      }, 100);
    } catch (err) { console.error(err); }
  }

  function renderPagination(total) {
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) {
      document.getElementById('pagination-container').innerHTML = '';
      return;
    }
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="window.changePage(${i})">${i}</button>`;
    }
    document.getElementById('pagination-container').innerHTML = html;
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
    document.getElementById('reply-info').innerHTML = `
      <div class="reply-target">
<span>回复 @${nickname}</span>
<svg onclick="window.cancelReply()" style="width:18px;height:18px;cursor:pointer;color:#ef4444" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </div>`;
    document.getElementById('comment-content').focus();
    document.getElementById('extalk-comments').scrollIntoView({ behavior: 'smooth' });
  };

  window.cancelReply = function() {
    replyingTo = null;
    document.getElementById('reply-info').innerHTML = '';
    document.getElementById('form-title').innerText = '发表评论';
  };

  window.likeComment = async (id, btn) => {
    if (localStorage.getItem('liked_comment_' + id)) return;
    try {
      const res = await fetch(`${API_ENDPOINT}/comment/like`, {
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
    } catch(e) {}
  };

  window.likePage = async (pageUrl) => {
    if (localStorage.getItem('liked_page_' + pageUrl)) return;
    try {
      const res = await fetch(`${API_ENDPOINT}/view`, {
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
    } catch(e) {}
  };

  window.delComment = async function(id) {
    if(!confirm('确定永久删除此评论？')) return;
    try {
      const res = await fetch(`${API_ENDPOINT}/admin/comments/${id}`, {
method: 'DELETE',
headers: { 'Authorization': `Bearer ${currentUser.token}` }
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
    if (content.length > maxCommentLength) return alert(`评论内容过长，不能超过 ${maxCommentLength} 个字符`);
    const submitBtn = document.getElementById('submit-comment');
    submitBtn.disabled = true; submitBtn.innerText = '正在发布...';
    try {
      const res = await fetch(`${API_ENDPOINT}/comments`, {
method: 'POST',
headers: { 
  'Content-Type': 'application/json',
  'Authorization': currentUser ? `Bearer ${currentUser.token}` : ''
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
})();

