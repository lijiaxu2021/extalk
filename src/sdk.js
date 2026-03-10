(function() {
  const HCAPTCHA_SCRIPT_URL = 'https://js.hcaptcha.com/1/api.js';
  const API_ENDPOINT = 'https://comment.upxuu.com';
  const HCAPTCHA_SITE_KEY = '09063bfe-9ca4-46d6-ae94-b7486344b53a';

  // 配置参数 - 从 URL 参数获取，如果没有则使用默认值
  const urlParams = new URLSearchParams(window.location.search);
  let config = {
    loadMode: urlParams.get('loadMode') || 'infinite', // 'infinite' 或 'button'
    pageSize: parseInt(urlParams.get('pageSize') || '6')
  };

  let replyingTo = null;
  let currentUser = JSON.parse(localStorage.getItem('extalk_user') || 'null');
  let currentPage = 1;
  let totalPages = 1;
  let isLoading = false;
  let hasMore = true;
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
      margin-left: 40px;
      border-left: 2px solid #f1f5f9;
      padding-left: 20px;
    }
    .floor-tag {
      background: #e1f0ff;
      color: #0070f3;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 700;
    }
    .modal {
      display: none;
      position: fixed;
      z-index: 1000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.5);
    }
    .modal-content {
      background-color: #fefefe;
      margin: 10% auto;
      padding: 30px;
      border: 1px solid #888;
      width: 90%;
      max-width: 400px;
      border-radius: 16px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    }
    .pagination-container {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 10px;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid rgba(0, 112, 243, 0.1);
    }
    .page-info {
      color: #64748b;
      font-size: 0.9rem;
    }
    .load-more-btn {
      background: #0070f3;
      color: white;
      border: none;
      padding: 10px 24px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.95rem;
      transition: all 0.2s;
      box-shadow: 0 4px 12px rgba(0, 112, 243, 0.3);
    }
    .load-more-btn:hover {
      background: #0060d9;
      transform: translateY(-1px);
      box-shadow: 0 6px 15px rgba(0, 112, 243, 0.4);
    }
    .load-more-btn:disabled {
      background: #a0cfff;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    .loading-indicator {
      text-align: center;
      padding: 20px;
      color: #94a3b8;
      font-size: 0.9rem;
      display: none;
    }
    .loading-indicator.show {
      display: block;
    }
    .loading-spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid rgba(0, 112, 243, 0.3);
      border-radius: 50%;
      border-top-color: #0070f3;
      animation: spin 0.8s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
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
      <div class="comment-form">
        <div class="form-title">
          <span id="form-title">发表评论</span>
          <span class="close-form-btn" id="close-form-btn">关闭</span>
        </div>
        <div id="reply-info"></div>
        <div class="input-group">
          <input type="text" id="comment-nickname" class="comment-input" placeholder="昵称" required />
        </div>
        <div class="input-group">
          <textarea id="comment-content" class="comment-input" style="height: 100px; resize: vertical;" placeholder="评论内容" required></textarea>
        </div>
        <div id="hcaptcha-container" style="margin-bottom: 15px;"></div>
        <button id="submit-comment" class="submit-btn">提交评论</button>
      </div>
      <div class="views-info" id="views-info"></div>
      <div id="comments-list">正在加载评论...</div>
      <div class="loading-indicator" id="loading-indicator">
        <span class="loading-spinner"></span>加载中...
      </div>
      <div class="pagination-container" id="pagination-container" style="display: none;">
        <span class="page-info" id="page-info"></span>
        <button class="load-more-btn" id="load-more-btn">加载更多</button>
      </div>
      
      <div id="auth-modal" class="modal">
        <div class="modal-content">
          <h3 id="modal-title" style="margin-top: 0; color: #1a1a1a;">登录</h3>
          <div class="input-group"><input type="email" id="auth-email" class="comment-input" placeholder="邮箱" /></div>
          <div class="input-group"><input type="password" id="auth-password" class="comment-input" placeholder="密码" /></div>
          <div class="input-group" id="nickname-group" style="display:none;"><input type="text" id="auth-nickname" class="comment-input" placeholder="昵称" /></div>
          <div id="auth-hcaptcha-container" style="margin-bottom: 15px;"></div>
          <button id="auth-submit" class="submit-btn" style="width:100%">提交</button>
          <p style="font-size:0.85rem; text-align:center; margin-top:15px; color: #64748b;">
            <a href="javascript:void(0)" id="auth-toggle" style="color: #0070f3; text-decoration: none;">切换到注册</a>
          </p>
        </div>
      </div>
    `;

    updateAuthUI();

    // 加载 hCaptcha
    const script = document.createElement('script');
    script.src = HCAPTCHA_SCRIPT_URL;
    script.async = true; script.defer = true;
    document.head.appendChild(script);

    script.onload = () => {
      if (window.hcaptcha) {
        hcaptchaWidgetId = window.hcaptcha.render('#hcaptcha-container', { sitekey: HCAPTCHA_SITE_KEY });
        authHcaptchaWidgetId = window.hcaptcha.render('#auth-hcaptcha-container', { sitekey: HCAPTCHA_SITE_KEY });
      }
    };

    // 表单切换按钮
    const toggleBtn = document.createElement('div');
    toggleBtn.className = 'form-toggle-btn';
    toggleBtn.innerHTML = `
      <svg style="width:18px;height:18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
      </svg>
      <span>发表评论</span>
    `;
    toggleBtn.onclick = () => {
      const form = document.querySelector('.comment-form');
      form.classList.toggle('expanded');
      if (form.classList.contains('expanded')) {
        document.getElementById('comment-content').focus();
      }
    };
    container.insertBefore(toggleBtn, container.firstChild);

    document.getElementById('submit-comment').onclick = submitComment;
    document.getElementById('close-form-btn').onclick = () => {
      document.querySelector('.comment-form').classList.remove('expanded');
    };
    
    document.getElementById('auth-status-btn').onclick = () => {
      if (currentUser) {
        if(confirm('确定登出？')) {
           localStorage.removeItem('extalk_user');
           currentUser = null;
           updateAuthUI();
           loadComments();
        }
      } else {
        document.getElementById('auth-modal').style.display = 'block';
      }
    };

    window.onclick = (e) => {
      if (e.target == document.getElementById('auth-modal')) document.getElementById('auth-modal').style.display = 'none';
    };

    let isLogin = true;
    document.getElementById('auth-toggle').onclick = () => {
      isLogin = !isLogin;
      document.getElementById('modal-title').innerText = isLogin ? '登录' : '注册';
      document.getElementById('nickname-group').style.display = isLogin ? 'none' : 'block';
      document.getElementById('auth-toggle').innerText = isLogin ? '切换到注册' : '切换到登录';
    };

    document.getElementById('auth-submit').onclick = async () => {
      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;
      const nickname = document.getElementById('auth-nickname').value;
      
      const hcaptchaToken = window.hcaptcha ? window.hcaptcha.getResponse(authHcaptchaWidgetId) : null;
      if (!hcaptchaToken) {
        alert('请先完成人机验证');
        return;
      }
      
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const body = isLogin ? { email, password } : { email, password, nickname };

      try {
        const res = await fetch(`${API_ENDPOINT}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.ok) {
          if (isLogin) {
            currentUser = data;
            localStorage.setItem('extalk_user', JSON.stringify(data));
            document.getElementById('auth-modal').style.display = 'none';
            updateAuthUI();
            loadComments();
          } else {
            alert('注册成功，请查收验证邮件');
          }
        } else {
          alert(data.error || '认证失败');
        }
      } catch (err) { alert('网络错误'); }
    };
  }

  function updateAuthUI() {
    // 更新认证按钮显示
    const authBtn = document.querySelector('.auth-btn');
    if (!authBtn) return;
    
    if (currentUser) {
      authBtn.innerText = `已登录：${currentUser.nickname}`;
    } else {
      authBtn.innerText = '登录/注册';
    }
  }

  async function loadComments(append = false) {
    const listContainer = document.getElementById('comments-list');
    const pageUrl = window.location.pathname;
    const loadingIndicator = document.getElementById('loading-indicator');
    const paginationContainer = document.getElementById('pagination-container');
    const pageInfo = document.getElementById('page-info');
    const loadMoreBtn = document.getElementById('load-more-btn');
    
    if (isLoading) return;
    isLoading = true;
    
    if (append) {
      loadingIndicator.classList.add('show');
      loadMoreBtn.disabled = true;
      loadMoreBtn.innerText = '加载中...';
    } else {
      listContainer.innerHTML = '正在加载评论...';
    }
    
    try {
      const response = await fetch(`${API_ENDPOINT}/comments?url=${encodeURIComponent(pageUrl)}&page=${currentPage}&limit=${config.pageSize}`);
      const data = await response.json();
      const allComments = data.comments || [];
      const total = data.total || 0;
      const views = data.views || 0;
      const pageLikes = data.page_likes || 0;
      
      totalPages = Math.ceil(total / config.pageSize);
      hasMore = currentPage < totalPages;
      
      // 更新浏览数和点赞数显示
      updateViewsInfo(views, pageLikes);
      
      if (allComments.length === 0 && !append) {
        listContainer.innerHTML = '<p style="text-align: center; color: #999; margin-top: 40px;">暂无评论，快来抢沙发吧！</p>';
        paginationContainer.style.display = 'none';
        return;
      }
      
      const rootComments = allComments.filter(c => !c.parent_id);
      const replies = allComments.filter(c => c.parent_id);
      const isAdmin = currentUser && currentUser.role === 'admin';

      const html = rootComments.map((c, index) => {
        const commentReplies = replies.filter(r => r.parent_id === c.id);
        const delBtnHtml = isAdmin ? `<span class="del-btn" onclick="window.delComment(${c.id})">删除</span>` : '';
        const globalIndex = (currentPage - 1) * config.pageSize + index + 1;
        
        return `
          <div class="comment-item">
            <div class="comment-header">
              <div><span class="comment-author">${escapeHtml(c.nickname)}</span><span class="floor-tag">${globalIndex}F</span></div>
              <span class="comment-meta">${new Date(c.created_at).toLocaleString()}</span>
            </div>
            <div class="comment-content">${escapeHtml(c.content)}</div>
            <div class="comment-footer">
              <a href="javascript:void(0)" class="reply-btn" onclick="window.setReply(${c.id}, '${escapeHtml(c.nickname)}')">回复</a>
              ${delBtnHtml}
            </div>
            ${commentReplies.length > 0 ? `
              <div class="replies-container">
                ${commentReplies.map(r => {
                  const rDelBtnHtml = isAdmin ? `<span class="del-btn" onclick="window.delComment(${r.id})" style="font-size:0.8rem; margin-left:10px;">删除</span>` : '';
                  return `
                    <div class="comment-item" style="margin-top: 10px; border: none; background: #fcfdfe; padding: 10px 0; border-bottom: 1px dashed #eee; animation: none; opacity: 1; transform: none; box-shadow: none;">
                      <div class="comment-header">
                        <span class="comment-author">${escapeHtml(r.nickname)}</span>
                        <span class="comment-meta">${new Date(r.created_at).toLocaleString()}</span>
                      </div>
                      <div class="comment-content">${escapeHtml(r.content)}</div>
                      <div class="comment-footer" style="margin-top:5px;">${rDelBtnHtml}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : ''}
          </div>`;
      }).join('');

      if (append) {
        // 追加模式：将新评论添加到列表末尾
        listContainer.insertAdjacentHTML('beforeend', html);
      } else {
        // 首次加载：替换整个列表
        listContainer.innerHTML = html;
      }
      
      // 添加动画 - 一次只有一个评论项滑出
      setTimeout(() => {
        const commentItems = listContainer.querySelectorAll('.comment-item');
        let currentIndex = append ? listContainer.querySelectorAll('.comment-item:not(.animate-in)').length > 0 ? 
          listContainer.querySelectorAll('.comment-item:not(.animate-in)')[0] : null : commentItems[0];
        
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('animate-in');
              observer.unobserve(entry.target);
              
              // 观察下一个评论项
              const nextIndex = Array.from(commentItems).indexOf(entry.target) + 1;
              if (nextIndex < commentItems.length) {
                observer.observe(commentItems[nextIndex]);
              }
            }
          });
        }, {
          threshold: 0.3,
          rootMargin: '0px 0px -100px 0px'
        });
        
        // 从第一个未动画的评论项开始观察
        const firstNotAnimated = Array.from(commentItems).find(item => !item.classList.contains('animate-in'));
        if (firstNotAnimated) {
          observer.observe(firstNotAnimated);
        }
      }, 100);
      
      // 更新分页信息
      if (config.loadMode === 'button') {
        // 按钮模式：显示分页控件
        paginationContainer.style.display = 'flex';
        pageInfo.innerText = `第 ${currentPage} / ${totalPages} 页`;
        loadMoreBtn.disabled = !hasMore;
        loadMoreBtn.innerText = hasMore ? '加载更多' : '没有更多了';
      } else {
        // 无限滚动模式：隐藏分页控件
        paginationContainer.style.display = 'none';
      }
      
    } catch (err) {
      console.error(err);
      if (append) {
        alert('加载失败，请重试');
      } else {
        listContainer.innerHTML = '<p style="text-align: center; color: #ef4444;">加载失败，请刷新页面重试</p>';
      }
    } finally {
      isLoading = false;
      loadingIndicator.classList.remove('show');
      if (loadMoreBtn) {
        loadMoreBtn.disabled = !hasMore;
        loadMoreBtn.innerText = hasMore ? '加载更多' : '没有更多了';
      }
    }
  }

  function updateViewsInfo(views, likes) {
    const container = document.getElementById('views-info');
    if (!container) return;
    
    container.innerHTML = `
      <div class="views-info-item">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
        </svg>
        <span>${views} 次浏览</span>
      </div>
      <div class="views-info-item clickable" id="like-btn">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
        </svg>
        <span>${likes} 次喜欢</span>
      </div>
    `;
    
    // 点赞功能
    document.getElementById('like-btn').onclick = async () => {
      try {
        await fetch(`${API_ENDPOINT}/like?url=${encodeURIComponent(window.location.pathname)}`, { method: 'POST' });
        const likeItem = document.getElementById('like-btn');
        likeItem.classList.add('liked');
        const count = parseInt(likeItem.querySelector('span').innerText);
        likeItem.querySelector('span').innerText = `${count + 1} 次喜欢`;
      } catch (err) {
        console.error(err);
      }
    };
  }

  window.setReply = function(id, nickname) {
    replyingTo = id;
    const form = document.querySelector('.comment-form');
    form.classList.add('expanded');
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

  window.delComment = async function(id) {
    if(!confirm('确定删除此评论？')) return;
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
    const content = document.getElementById('comment-content').value.trim();
    const nickname = document.getElementById('comment-nickname').value.trim();
    
    const hcaptchaToken = window.hcaptcha ? window.hcaptcha.getResponse(hcaptchaWidgetId) : null;
    if (!hcaptchaToken) {
      alert('请先完成人机验证');
      return;
    }
    
    if (!content || !nickname) return alert('请填写完整');
    
    const submitBtn = document.getElementById('submit-comment');
    submitBtn.disabled = true; submitBtn.innerText = '提交中...';
    
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
        document.getElementById('comment-content').value = '';
        cancelReply();
        if (window.hcaptcha) window.hcaptcha.reset(hcaptchaWidgetId);
        
        // 重置到第一页并重新加载
        currentPage = 1;
        loadComments();
        
        // 提示成功
        alert('评论成功！');
      } else { alert(await res.text()); }
    } catch (err) { alert('提交失败'); }
    finally { submitBtn.disabled = false; submitBtn.innerText = '提交评论'; }
  }

  // 加载更多按钮点击事件
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'load-more-btn') {
      if (hasMore && !isLoading) {
        currentPage++;
        loadComments(true); // append mode
      }
    }
  });

  // 无限滚动加载
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    if (config.loadMode !== 'infinite' || isLoading || !hasMore) return;
    
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      // 距离底部还有 200px 时触发加载
      if (scrollTop + windowHeight >= documentHeight - 200) {
        currentPage++;
        loadComments(true); // append mode
      }
    }, 200);
  });

  function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
