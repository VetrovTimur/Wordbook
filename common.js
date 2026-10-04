/* common.js — общие утилиты и константы */

const CURRENT_USER_KEY = 'wordbook_current_user';
const PASSWORD_MIN = 6;

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function sanitizeSectionName(raw) {
  let name = String(raw || '');
  name = name.replace(/[^\p{L}\p{N}\s()]/gu, ' ');
  name = name.replace(/\s+/g, ' ').trim();
  if (name.length > 50) name = name.slice(0, 50).trim();
  if (name) name = name.charAt(0).toUpperCase() + name.slice(1);
  return name;
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error('load fail: ' + url));
    document.head.appendChild(s);
  });
}

const uid = () => 'id_' + Math.random().toString(36).slice(2, 10);

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/* ============================================================
   PWA — Service Worker (обновление)
   ============================================================ */
let _swRefreshed = false;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_swRefreshed) return;
    _swRefreshed = true;
    window.location.reload();
  });
}

/* ============================================================
   Toast-уведомления
   ============================================================ */
const TOAST_ICONS = {
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

let _lastToastMsg = '';
let _lastToastTime = 0;

function showToast(message, type = 'error', duration = 4000) {
  const now = Date.now();
  if (message === _lastToastMsg && now - _lastToastTime < 2500) return;
  _lastToastMsg = message;
  _lastToastTime = now;

  let container = document.getElementById('wb-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'wb-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'wb-toast wb-toast--' + type;
  toast.innerHTML =
    '<div class="wb-toast__icon">' + (TOAST_ICONS[type] || TOAST_ICONS.error) + '</div>' +
    '<div class="wb-toast__text"></div>' +
    '<button class="wb-toast__close" type="button" aria-label="Закрыть">×</button>';
  toast.querySelector('.wb-toast__text').textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('wb-toast--show'));

  let closed = false;
  const dismiss = () => {
    if (closed) return;
    closed = true;
    toast.classList.remove('wb-toast--show');
    setTimeout(() => toast.remove(), 300);
  };

  const timer = setTimeout(dismiss, duration);
  toast.querySelector('.wb-toast__close').addEventListener('click', () => {
    clearTimeout(timer);
    dismiss();
  });
}

window.addEventListener('offline', () => showToast('Соединение потеряно', 'warning', 3000));
window.addEventListener('online',  () => showToast('Соединение восстановлено', 'info', 2500));