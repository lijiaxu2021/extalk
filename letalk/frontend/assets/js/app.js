// Letalk Forum App JavaScript

const API_BASE = '';

// User state
let currentUser = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadUser();
  updateAuthUI();
});

// Load user from localStorage
function loadUser() {
  const userStr = localStorage.getItem('letalk_user');
  if (userStr) {
    currentUser = JSON.parse(userStr);
  }
}

// Save user to localStorage
function saveUser(user) {
  currentUser = user;
  localStorage.setItem('letalk_user', JSON.stringify(user));
  updateAuthUI();
}

// Logout
function logout() {
  localStorage.removeItem('letalk_user');
  currentUser = null;
  updateAuthUI();
  window.location.href = '/';
}

// Update auth buttons UI
function updateAuthUI() {
  const container = document.getElementById('auth-buttons');
  if (!container) return;
  
  if (currentUser) {
    container.innerHTML = `
      <div class="user-menu">
        <span class="user-name">${currentUser.nickname}</span>
        <a href="/user.html" class="btn btn-sm btn-secondary">个人中心</a>
        <button onclick="logout()" class="btn btn-sm btn-secondary">退出</button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <a href="/login.html" class="btn btn-sm btn-secondary">登录</a>
      <a href="/register.html" class="btn btn-sm btn-primary">注册</a>
    `;
  }
}

// Format time ago
function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

// Show toast notification
function toast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 25px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#0070f3'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    z-index: 9999;
    animation: slideIn 0.3s ease;
  `;
  
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add CSS animation for toast
if (!document.getElementById('toast-styles')) {
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(400px); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// API helper
async function apiCall(endpoint, method = 'GET', data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (currentUser) {
    options.headers['Authorization'] = `Bearer ${currentUser.token}`;
  }
  
  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }
  
  const res = await fetch(`${API_BASE}${endpoint}`, options);
  const result = await res.json();
  
  if (!res.ok) {
    throw new Error(result.error || 'Request failed');
  }
  
  return result;
}

// Check if user is logged in
function requireAuth() {
  if (!currentUser) {
    toast('请先登录', 'error');
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 1000);
    return false;
  }
  return true;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
