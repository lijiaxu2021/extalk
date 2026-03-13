export const sdkCode = `(function() {
  const SCRIPT_URL = 'https://js.hcaptcha.com/1/api.js';
  const API_ENDPOINT = window.EX_TALK_API_URL || 'BASE_URL_PLACEHOLDER';
  const HCAPTCHA_SITE_KEY = '09063bfe-9ca4-46d6-ae94-b7486344b53a';

  let replyingTo = null;
  let currentUser = JSON.parse(localStorage.getItem('extalk_user') || 'null');
  let currentPage = 1;
  const pageSize = 6;
  let maxCommentLength = 500;
  let hcaptchaWidgetId = null;
  let authHcaptchaWidgetId = null;

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
      display: none;
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
    .comment-form-container {
      border: 1px solid #e0e7ff;
      border-radius: 12px;
      padding: 20px;
      background: linear-gradient(to bottom, #f5f9ff, #ffffff);
      margin-bottom: 30px;
    }
    .form-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .reply-target {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #ef4444;
      font-size: 0.9rem;
    }
    .close-form-btn {
      color: #94a3b8;
      cursor: pointer;
      padding: 5px;
      border-radius: 5px;
      transition: all 0.2s;
    }
    .close-form-btn:hover {
      color: #64748b;
      background: rgba(0,0,0,0.05);
    }
    .form-group {
      margin-bottom: 15px;
    }
    .form-group label {
      display: block;
      margin-bottom: 5px;
      color: #4a5568;
      font-size: 0.9rem;
      font-weight: 500;
    }
    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 10px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.9rem;
      outline: none;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }
    .form-group input:focus,
    .form-group textarea:focus {
      border-color: #0070f3;
    }
    .form-group textarea {
      resize: vertical;
      min-height: 100px;
      font-family: inherit;
    }
    .submit-btn {
      background: #0070f3;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .submit-btn:hover {
      background: #0056cc;
    }
    .submit-btn:disabled {
      background: #94a3b8;
      cursor: not-allowed;
    }
    .comment-item {
      background: white;
      border: 1px solid #eef2f7;
      border-radius: 12px;
      padding: 15px;
      margin-bottom: 15px;
      transition: all 0.3s;
    }
    .comment-item:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      transform: translateY(-2px);
    }
    .comment-item.animate-in {
      animation: slideInLeft 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
    }
    @keyframes slideInLeft {
      from {
        opacity: 0;
        transform: translateX(-30px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    .comment-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .comment-author {
      font-weight: 600;
      color: #1a202c;
    }
    .comment-meta {
      color: #94a3b8;
      font-size: 0.85rem;
    }
    .floor-tag {
      background: #f0f4ff;
      color: #0070f3;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.75rem;
      margin-left: 8px;
      font-weight: 600;
    }
    .location-tag {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      color: #718096;
      font-size: 0.8rem;
      margin-left: 8px;
    }
    .comment-content {
      color: #2d3748;
      line-height: 1.6;
      word-wrap: break-word;
    }
    .comment-footer {
      display: flex;
      gap: 15px;
      align-items: center;
      margin-top: 10px;
    }
    .like-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #718096;
      cursor: pointer;
      transition: all 0.2s;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .like-btn:hover {
      background: #f7fafc;
      color: #e53e3e;
    }
    .like-btn.liked {
      color: #e53e3e;
    }
    .like-btn svg {
      width: 16px;
      height: 16px;
    }
    .like-count {
      font-size: 0.85rem;
    }
    .reply-btn {
      color: #0070f3;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.2s;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .reply-btn:hover {
      background: #ebf8ff;
    }
    .del-btn {
      color: #ef4444;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.2s;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .del-btn:hover {
      background: #fee2e2;
    }
    .views-info-item {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #718096;
      font-size: 0.85rem;
    }
    .views-info-item svg {
      width: 16px;
      height: 16px;
    }
    .clickable {
      cursor: pointer;
      transition: all 0.2s;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .clickable:hover {
      background: #fff5f5;
      color: #e53e3e;
    }
    .clickable.liked {
      color: #e53e3e;
    }
    .auth-btn {
      background: #0070f3;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.9rem;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .auth-btn:hover {
      background: #0056cc;
    }
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    .modal-content {
      background: white;
      padding: 30px;
      border-radius: 12px;
      max-width: 400px;
      width: 90%;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .modal-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1a202c;
    }
    .close-modal {
      color: #94a3b8;
      cursor: pointer;
      padding: 5px;
    }
    .close-modal:hover {
      color: #64748b;
    }
    .pagination-container {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-top: 20px;
    }
    .page-btn {
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .page-btn:hover {
      background: #f7fafc;
      border-color: #cbd5e0;
    }
    .page-btn.active {
      background: #0070f3;
      color: white;
      border-color: #0070f3;
    }
  \`;

  function init() {
    const container = document.getElementById('extalk-comments');
    if (!container) return;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);

    container.innerHTML = \`
      <div id="auth-section" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div id="user-info" style="display: flex; align-items: center; gap: 10px;">
          <span id="user-name" style="font-weight: 600; color: #1a202c;"></span>
          <button id="logout-btn" class="auth-btn" style="background: #ef4444;">登出</button>
        </div>
        <button id="login-btn" class="auth-btn">登录/注册</button>
      </div>
      
      <div id="comment-form-container" class="comment-form">
        <div class="comment-form-container">
          <div class="form-header">
            <h3 id="form-title" style="margin: 0; color: #1a202c;">发表评论</h3>
            <div class="close-form-btn" onclick="document.getElementById('comment-form-container').classList.remove('expanded'); setTimeout(() => { document.getElementById('comment-form-container').style.display = 'none'; document.getElementById('form-toggle').style.display = 'flex'; }, 400);">
              <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
          </div>
          <div id="reply-info" style="margin-bottom: 15px;"></div>
          <div class="form-group">
            <label>昵称</label>
            <input type="text" id="comment-nickname" placeholder="请输入昵称" maxlength="50">
          </div>
          <div class="form-group">
            <label>内容</label>
            <textarea id="comment-content" placeholder="写下你的想法..." maxlength="500"></textarea>
          </div>
          <div id="hcaptcha-comment" style="margin-bottom: 15px;"></div>
          <button id="submit-comment" class="submit-btn">发布评论</button>
        </div>
      </div>
      
      <div id="form-toggle" class="form-toggle-btn" onclick="showForm()">
        <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
        </svg>
        <span>发表评论</span>
      </div>
      
      <div id="comments-list" style="margin-top: 30px;"></div>
      <div id="pagination-container" class="pagination-container"></div>
      
      <div id="auth-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title" id="auth-modal-title">登录</h3>
            <span class="close-modal" onclick="closeAuthModal()">×</span>
          </div>
          <div class="form-group">
            <label>邮箱</label>
            <input type="email" id="auth-email" placeholder="请输入邮箱">
          </div>
          <div class="form-group">
            <label>昵称</label>
            <input type="text" id="auth-nickname" placeholder="请输入昵称">
          </div>
          <div class="form-group" id="password-group">
            <label>密码</label>
            <input type="password" id="auth-password" placeholder="请输入密码">
          </div>
          <div id="hcaptcha-auth" style="margin-bottom: 15px;"></div>
          <button id="auth-submit" class="submit-btn" style="width: 100%;">登录</button>
          <div style="text-align: center; margin-top: 15px;">
            <a href="#" id="toggle-auth-mode" style="color: #0070f3; font-size: 0.9rem;">没有账号？去注册</a>
          </div>
        </div>
      </div>
      
      <div id="views-counter" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eef2f7; display: flex; gap: 20px; flex-wrap: wrap;"></div>
    \`;

    updateAuthUI();
    loadComments();
    setupEventListeners();
    loadHcaptcha();
  }

  function loadHcaptcha() {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    script.onload = () => {
      if (window.hcaptcha) {
        hcaptchaWidgetId = window.hcaptcha.render('hcaptcha-comment', { sitekey: HCAPTCHA_SITE_KEY });
        authHcaptchaWidgetId = window.hcaptcha.render('hcaptcha-auth', { sitekey: HCAPTCHA_SITE_KEY, size: 'invisible' });
      }
    };
  }

  function updateAuthUI() {
    const userInfo = document.getElementById('user-info');
    const userName = document.getElementById('user-name');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const nicknameInput = document.getElementById('comment-nickname');

    if (currentUser) {
      userInfo.style.display = 'flex';
      loginBtn.style.display = 'none';
      userName.textContent = currentUser.nickname;
      if (nicknameInput) {
        nicknameInput.value = currentUser.nickname;
        nicknameInput.disabled = true;
      }
      logoutBtn.onclick = () => {
        if(confirm('确定登出？')) {
          localStorage.removeItem('extalk_user');
          currentUser = null;
          updateAuthUI();
          loadComments();
        }
      };
    } else {
      userInfo.style.display = 'none';
      loginBtn.style.display = 'block';
      if (nicknameInput) {
        nicknameInput.disabled = false;
      }
    }
  }

  function showForm() {
    const form = document.getElementById('comment-form-container');
    const toggle = document.getElementById('form-toggle');
    
    if (!currentUser) {
      openAuthModal();
      return;
    }
    
    form.style.display = 'block';
    setTimeout(() => {
      form.classList.add('expanded');
    }, 10);
    toggle.style.display = 'none';
  }

  function setupEventListeners() {
    document.getElementById('login-btn').onclick = openAuthModal;
    document.getElementById('auth-submit').onclick = handleAuth;
    document.getElementById('submit-comment').onclick = () => submitComment();
    document.getElementById('toggle-auth-mode').onclick = toggleAuthMode;
  }

  let isLoginMode = true;
  function openAuthModal() {
    document.getElementById('auth-modal').style.display = 'flex';
    document.getElementById('auth-modal-title').innerText = isLoginMode ? '登录' : '注册';
    document.getElementById('toggle-auth-mode').innerText = isLoginMode ? '没有账号？去注册' : '已有账号？去登录';
    document.getElementById('password-group').style.display = isLoginMode ? 'block' : 'none';
  }

  function closeAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
  }

  function toggleAuthMode(e) {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    openAuthModal();
  }

  async function handleAuth() {
    const email = document.getElementById('auth-email').value.trim();
    const nickname = document.getElementById('auth-nickname').value.trim();
    const password = document.getElementById('auth-password').value.trim();

    if (!email || !nickname || (!password && isLoginMode)) {
      alert('请填写完整信息');
      return;
    }

    try {
      window.hcaptcha.execute(authHcaptchaWidgetId);
      
      setTimeout(async () => {
        const hcaptchaToken = window.hcaptcha.getResponse(authHcaptchaWidgetId);
        if (!hcaptchaToken) {
          alert('请先完成人机验证');
          return;
        }

        const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
        const res = await fetch(API_ENDPOINT + endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email, 
            nickname, 
            password: password || 'temp',
            hcaptcha_token: hcaptchaToken 
          })
        });
        const data = await res.json();
        
        if (res.ok && data.token) {
          currentUser = data;
          localStorage.setItem('extalk_user', JSON.stringify(data));
          document.getElementById('auth-modal').style.display = 'none';
          updateAuthUI();
          loadComments();
        } else {
          alert(data.error || '操作失败');
          window.hcaptcha.reset(authHcaptchaWidgetId);
        }
      }, 1000);
    } catch (err) {
      alert('请求失败，请重试');
    }
  }

  async function loadComments() {
    const listContainer = document.getElementById('comments-list');
    const pageUrl = window.location.pathname;
    
    if (listContainer) {
      listContainer.style.opacity = '1';
      listContainer.style.transition = 'none';
    }
    
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
      
      setTimeout(() => {
        const commentItems = Array.from(listContainer.querySelectorAll('.comment-item'));
        let currentIndex = 0;
        
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && currentIndex < commentItems.length) {
              const currentItem = commentItems[currentIndex];
              if (currentItem && currentItem === entry.target) {
                currentItem.classList.add('animate-in');
                currentIndex++;
                observer.unobserve(currentItem);
                
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
      html += \`<button class="page-btn \${i === currentPage ? 'active' : ''}" onclick="window.changePage(\${i})">\${i}</button>\`;
    }
    document.getElementById('pagination-container').innerHTML = html;
  }

  window.changePage = function(page) {
    currentPage = page;
    
    const commentsContainer = document.getElementById('extalk-comments');
    const listContainer = document.getElementById('comments-list');
    
    if (listContainer) {
      listContainer.style.opacity = '0';
      listContainer.style.transition = 'opacity 0.3s ease';
    }
    
    setTimeout(() => {
      loadComments();
      
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
    if (localStorage.getItem('liked_comment_' + id)) return;
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
    } catch(e) {}
  };

  window.likePage = async (pageUrl) => {
    if (localStorage.getItem('liked_page_' + pageUrl)) return;
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
    } catch(e) {}
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
