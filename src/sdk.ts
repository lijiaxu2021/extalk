export const sdkCode = `(function() {
  const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
  const API_ENDPOINT = 'BASE_URL_PLACEHOLDER';
  const TURNSTILE_SITE_KEY = '0x4AAAAAACn8mlN8AydkHuPD';

  let replyingTo = null;
  let currentUser = JSON.parse(localStorage.getItem('extalk_user') || 'null');

  const styles = \`
    #extalk-comments {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #333;
      max-width: 800px;
      margin: 20px auto;
    }
    .comment-form {
      background: #f0f7ff;
      padding: 20px;
      border-radius: 16px;
      border: 1px solid #cce4ff;
      margin-bottom: 30px;
      box-shadow: 0 4px 12px rgba(0, 112, 243, 0.05);
    }
    .form-title {
      margin: 0 0 15px 0;
      color: #0070f3;
      font-size: 1.2rem;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .auth-btn {
      font-size: 0.8rem;
      color: #0070f3;
      cursor: pointer;
      font-weight: 400;
    }
    .input-group {
      margin-bottom: 12px;
    }
    .comment-input {
      width: 100%;
      padding: 12px;
      border: 1px solid #d0e3ff;
      border-radius: 10px;
      box-sizing: border-box;
      transition: border-color 0.2s, box-shadow 0.2s;
      outline: none;
    }
    .comment-input:focus {
      border-color: #0070f3;
      box-shadow: 0 0 0 3px rgba(0, 112, 243, 0.1);
    }
    .submit-btn {
      background: #0070f3;
      color: white;
      border: none;
      padding: 10px 24px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.2s, transform 0.1s;
    }
    .submit-btn:hover {
      background: #0060d9;
    }
    .submit-btn:active {
      transform: scale(0.98);
    }
    .submit-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .comment-item {
      background: white;
      padding: 16px;
      border-radius: 14px;
      border: 1px solid #eef2f8;
      margin-bottom: 16px;
      animation: slideIn 0.5s ease-out forwards;
      opacity: 0;
      transform: translateX(-20px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
    }
    @keyframes slideIn {
      to { opacity: 1; transform: translateX(0); }
    }
    .comment-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .comment-author {
      font-weight: 600;
      color: #0070f3;
    }
    .comment-meta {
      font-size: 0.85rem;
      color: #888;
    }
    .comment-content {
      line-height: 1.6;
      word-break: break-all;
    }
    .comment-footer {
      margin-top: 10px;
      display: flex;
      gap: 15px;
      font-size: 0.85rem;
    }
    .reply-btn { color: #0070f3; cursor: pointer; }
    .del-btn { color: #ff4d4f; cursor: pointer; font-weight: 500; }
    .reply-target {
      background: #f9fbff;
      border-left: 3px solid #0070f3;
      padding: 5px 10px;
      margin-bottom: 10px;
      font-size: 0.9rem;
      color: #666;
      border-radius: 0 6px 6px 0;
    }
    .replies-container {
      margin-left: 30px;
      border-left: 2px solid #f0f7ff;
      padding-left: 15px;
    }
    .floor-tag {
      background: #e1f0ff;
      color: #0070f3;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: bold;
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
      margin: 15% auto;
      padding: 20px;
      border: 1px solid #888;
      width: 300px;
      border-radius: 16px;
    }
  \`;

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
    container.innerHTML = \`
      <div class="comment-form">
        <div class="form-title">
          <span id="form-title">发表评论</span>
          <span class="auth-btn" id="auth-status-btn">登录/注册</span>
        </div>
        <div id="reply-info"></div>
        <div class="input-group">
          <input type="text" id="comment-nickname" class="comment-input" placeholder="昵称" required />
        </div>
        <div class="input-group">
          <textarea id="comment-content" class="comment-input" style="height: 100px; resize: vertical;" placeholder="评论内容" required></textarea>
        </div>
        <div id="cf-turnstile-container" style="margin-bottom: 15px;"></div>
        <button id="submit-comment" class="submit-btn">提交评论</button>
      </div>
      <div id="comments-list">正在加载评论...</div>
      
      <div id="auth-modal" class="modal">
        <div class="modal-content">
          <h3 id="modal-title">登录</h3>
          <div class="input-group"><input type="email" id="auth-email" class="comment-input" placeholder="邮箱" /></div>
          <div class="input-group"><input type="password" id="auth-password" class="comment-input" placeholder="密码" /></div>
          <div class="input-group" id="nickname-group" style="display:none;"><input type="text" id="auth-nickname" class="comment-input" placeholder="昵称" /></div>
          <button id="auth-submit" class="submit-btn" style="width:100%">提交</button>
          <p style="font-size:0.8rem; text-align:center; margin-top:10px;">
            <a href="javascript:void(0)" id="auth-toggle">切换到注册</a>
          </p>
        </div>
      </div>
    \`;

    updateAuthUI();

    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true; script.defer = true;
    document.head.appendChild(script);

    script.onload = () => {
      if (window.turnstile) {
        window.turnstile.render('#cf-turnstile-container', { sitekey: TURNSTILE_SITE_KEY });
      }
    };

    document.getElementById('submit-comment').onclick = submitComment;
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
      
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const body = isLogin ? { email, password } : { email, password, nickname };

      try {
        const res = await fetch(\`\${API_ENDPOINT}\${endpoint}\`, {
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
    const btn = document.getElementById('auth-status-btn');
    const nickInput = document.getElementById('comment-nickname');
    if (currentUser) {
      btn.innerText = \`已登录：\${currentUser.nickname} (登出)\`;
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
    try {
      const response = await fetch(\`\${API_ENDPOINT}/comments?url=\${encodeURIComponent(pageUrl)}\`);
      const allComments = await response.json();
      if (allComments.length === 0) {
        listContainer.innerHTML = '<p style="text-align: center; color: #999; margin-top: 40px;">暂无评论，快来抢沙发吧！</p>';
        return;
      }
      const rootComments = allComments.filter(c => !c.parent_id);
      const replies = allComments.filter(c => c.parent_id);
      const isAdmin = currentUser && currentUser.role === 'admin';

      listContainer.innerHTML = rootComments.map((c, index) => {
        const commentReplies = replies.filter(r => r.parent_id === c.id);
        const delBtnHtml = isAdmin ? \`<span class="del-btn" onclick="window.delComment(\${c.id})">删除</span>\` : '';
        
        return \`
          <div class="comment-item" style="animation-delay: \${index * 0.1}s">
            <div class="comment-header">
              <div><span class="comment-author">\${escapeHtml(c.nickname)}</span><span class="floor-tag">\${index+1}F</span></div>
              <span class="comment-meta">\${new Date(c.created_at).toLocaleString()}</span>
            </div>
            <div class="comment-content">\${escapeHtml(c.content)}</div>
            <div class="comment-footer">
              <a href="javascript:void(0)" class="reply-btn" onclick="window.setReply(\${c.id}, '\${escapeHtml(c.nickname)}')">回复</a>
              \${delBtnHtml}
            </div>
            \${commentReplies.length > 0 ? \`
              <div class="replies-container">
                \${commentReplies.map(r => {
                  const rDelBtnHtml = isAdmin ? \`<span class="del-btn" onclick="window.delComment(\${r.id})" style="font-size:0.8rem; margin-left:10px;">删除</span>\` : '';
                  return \`
                    <div class="comment-item" style="margin-top: 10px; border: none; background: #fcfdfe; padding: 10px 0; border-bottom: 1px dashed #eee; animation: none; opacity: 1; transform: none; box-shadow: none;">
                      <div class="comment-header">
                        <span class="comment-author">\${escapeHtml(r.nickname)}</span>
                        <span class="comment-meta">\${new Date(r.created_at).toLocaleString()}</span>
                      </div>
                      <div class="comment-content">\${escapeHtml(r.content)}</div>
                      <div class="comment-footer" style="margin-top:5px;">\${rDelBtnHtml}</div>
                    </div>
                  \`;
                }).join('')}
              </div>
            \` : ''}
          </div>\`;
      }).join('');
    } catch (err) { console.error(err); }
  }

  window.setReply = function(id, nickname) {
    replyingTo = id;
    document.getElementById('form-title').innerText = '回复评论';
    document.getElementById('reply-info').innerHTML = \`
      <div class="reply-target">回复 @\${nickname}: <span onclick="window.cancelReply()" style="color:#ff4d4f;cursor:pointer;margin-left:10px;">取消</span></div>\`;
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
      const res = await fetch(\`\${API_ENDPOINT}/admin/comments/\${id}\`, {
        method: 'DELETE',
        headers: { 'Authorization': \`Bearer \${currentUser.token}\` }
      });
      if(res.ok) loadComments();
      else alert('删除失败：' + await res.text());
    } catch(e) { alert('请求失败'); }
  };

  async function submitComment() {
    const content = document.getElementById('comment-content').value.trim();
    const nickname = document.getElementById('comment-nickname').value.trim();
    const turnstileToken = document.querySelector('[name="cf-turnstile-response"]').value;
    if (!content || !nickname || !turnstileToken) return alert('请填写完整');
    const submitBtn = document.getElementById('submit-comment');
    submitBtn.disabled = true; submitBtn.innerText = '提交中...';
    try {
      const res = await fetch(\`\${API_ENDPOINT}/comments\`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': currentUser ? \`Bearer \${currentUser.token}\` : ''
        },
        body: JSON.stringify({
          page_url: window.location.pathname,
          nickname, content, turnstile_token: turnstileToken, parent_id: replyingTo
        })
      });
      if (res.ok) {
        document.getElementById('comment-content').value = '';
        cancelReply();
        if (window.turnstile) window.turnstile.reset('#cf-turnstile-container');
        loadComments();
      } else { alert(await res.text()); }
    } catch (err) { alert('提交失败'); }
    finally { submitBtn.disabled = false; submitBtn.innerText = '提交评论'; }
  }

  function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();`;
