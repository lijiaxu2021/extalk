/**
 * ExTalk 通用集成脚本
 * 使用方法：在页面底部添加一行代码即可
 * <script src="https://comment.upxuu.com/auto-integrate.js"></script>
 */

(function() {
  // 自动检测页面类型并集成
  function autoIntegrate() {
    // 检查是否已经初始化
    if (window.__extalk_auto_integrated) return;
    window.__extalk_auto_integrated = true;
    
    // 创建评论区
    const commentsDiv = document.createElement('div');
    commentsDiv.id = 'extalk-comments';
    commentsDiv.style.cssText = 'width: 100%; margin: 40px auto 0; padding-top: 40px; border-top: 1px solid #e5e7eb;';
    commentsDiv.innerHTML = '<h2 style="text-align: center; margin-bottom: 20px; color: #333;">💬 评论</h2><div id="extalk-comments-inner" style="margin-top: 20px;"></div>';
    
    // 智能查找插入位置
    let insertPosition = null;
    
    // 1. 查找文章容器
    const articleSelectors = [
      'article',
      '.post',
      '.article',
      '.blog-post',
      '[role="main"]',
      '.content',
      '.page-content'
    ];
    
    for (let selector of articleSelectors) {
      const article = document.querySelector(selector);
      if (article) {
        insertPosition = article;
        break;
      }
    }
    
    // 2. 如果找到文章容器，插入到文章后面
    if (insertPosition) {
      insertPosition.parentNode.insertBefore(commentsDiv, insertPosition.nextSibling);
    } else {
      // 3. 否则插入到 body 底部
      document.body.appendChild(commentsDiv);
    }
    
    // 加载 SDK
    const script = document.createElement('script');
    script.src = 'https://comment.upxuu.com/sdk.js';
    script.async = true;
    document.body.appendChild(script);
    
    console.log('✅ ExTalk 评论系统已自动集成');
  }
  
  // 页面加载完成后执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoIntegrate);
  } else {
    autoIntegrate();
  }
})();
