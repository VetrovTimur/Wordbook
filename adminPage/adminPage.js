const CURRENT_USER_KEY = 'wordbook_current_user';
const ADMIN_THEME_KEY = 'wordbook_admin_theme';
const PAGE_SIZE = 15;
const LOG_PAGE_SIZE = 20;
const PRELOADER_MIN_TIME = 1000;

let users = [];
let logs = [];
let feedbacks = [];
let currentUserData = null;
let currentSearch = '';
let currentFilter = 'all';
let currentPage = 1;

let currentNav = 'users';
let logSearch = '';
let logFilter = 'all';
let logPage = 1;

let feedbackSearch = '';
let feedbackFilter = 'all';
let feedbackPage = 1;

/* Тема */
function loadTheme() {
  try { return localStorage.getItem(ADMIN_THEME_KEY) || 'light'; } catch (e) { return 'light'; }
}
function saveTheme(t) { try { localStorage.setItem(ADMIN_THEME_KEY, t); } catch (e) {} }
let theme = loadTheme();

function applyTheme() {
  document.body.setAttribute('data-theme', theme);
  const label = document.getElementById('themeLabel');
  if (label) label.textContent = theme === 'light' ? 'Тёмная тема' : 'Светлая тема';
}

/* Логи */
async function loadLogs() {
  logs = await fbGetLogs(500);
}

/* Обратная связь */
async function loadFeedback() {
  feedbacks = await fbGetAllFeedback(500);
}

const LOG_TYPES = {
  block: {
    label: 'Блокировка',
    badgeClass: 'badge-danger',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  },
  unblock: {
    label: 'Разблокировка',
    badgeClass: 'badge-success',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,
  },
  delete: {
    label: 'Удаление',
    badgeClass: 'badge-danger',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>`,
  },
  export: {
    label: 'Экспорт',
    badgeClass: 'badge-info',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  },
  clearLogs: {
    label: 'Логи очищены',
    badgeClass: 'badge-danger',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  },
};

function updateLogsBadge() {
  const badge = document.getElementById('navLogsBadge');
  if (badge) badge.textContent = logs.length;
}

function updateFeedbackBadge() {
  const badge = document.getElementById('navFeedbackBadge');
  if (badge) badge.textContent = feedbacks.filter(f => !f.read).length;
}

/* Пользователи */
async function loadUsers() {
  const list = await fbGetAllUsers();
  users = list.map(u => ({
    id: u.id || u.name,
    name: u.name || u.id || 'Без имени',
    passHash: u.passHash || '',
    role: u.role || 'user',
    blocked: !!u.blocked,
    createdAt: u.createdAt || null,
  }));
  users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/* Утилиты */
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
async function withLoading(btn, asyncFn) {
  if (!btn) return asyncFn();
  if (btn.classList.contains('is-loading')) return;
  const wasDisabled = btn.disabled;
  btn.classList.add('is-loading');
  btn.disabled = true;
  try {
    return await asyncFn();
  } finally {
    btn.classList.remove('is-loading');
    if (!wasDisabled) btn.disabled = false;
  }
}

/* Статистика и пагинация пользователей */
function computeStats() {
  const total = users.length;
  const active = users.filter(u => !u.blocked).length;
  const blocked = users.filter(u => u.blocked).length;
  const week = Date.now() - 7 * 86400000;
  const recent = users.filter(u => u.createdAt && u.createdAt >= week).length;
  return { total, active, blocked, recent };
}

function getFilteredUsers() {
  let list = [...users];
  if (currentFilter === 'active') list = list.filter(u => !u.blocked);
  else if (currentFilter === 'blocked') list = list.filter(u => u.blocked);
  else if (currentFilter === 'recent') {
    const week = Date.now() - 7 * 86400000;
    list = list.filter(u => u.createdAt && u.createdAt >= week);
  }
  if (currentSearch.trim()) {
    const q = currentSearch.trim().toLowerCase();
    list = list.filter(u => u.name.toLowerCase().includes(q));
  }
  return list;
}

function getPageSlice() {
  const all = getFilteredUsers();
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  return { all, total, totalPages, start, end, pageItems: all.slice(start, end) };
}

/* Статистика и пагинация логов */
function computeLogStats() {
  const total = logs.length;
  const blocks = logs.filter(l => l.type === 'block' || l.type === 'unblock').length;
  const deletes = logs.filter(l => l.type === 'delete').length;
  const system = logs.filter(l => ['export', 'clearLogs'].includes(l.type)).length;
  return { total, blocks, deletes, system };
}

function getFilteredLogs() {
  let list = [...logs];
  if (logFilter === 'blocks') list = list.filter(l => l.type === 'block' || l.type === 'unblock');
  else if (logFilter === 'deletes') list = list.filter(l => l.type === 'delete');
  else if (logFilter === 'system') list = list.filter(l => ['export', 'clearLogs'].includes(l.type));

  if (logSearch.trim()) {
    const q = logSearch.trim().toLowerCase();
    list = list.filter(l =>
      (l.target || '').toLowerCase().includes(q) ||
      (l.details || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function getLogPageSlice() {
  const all = getFilteredLogs();
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / LOG_PAGE_SIZE));
  if (logPage > totalPages) logPage = totalPages;
  if (logPage < 1) logPage = 1;
  const start = (logPage - 1) * LOG_PAGE_SIZE;
  const end = start + LOG_PAGE_SIZE;
  return { all, total, totalPages, start, end, pageItems: all.slice(start, end) };
}

/* Отрисовка */
function render() {
  applyTheme();
  updateLogsBadge();
  updateFeedbackBadge();
  renderNavBadge();

  if (currentNav === 'users') {
    document.getElementById('usersView').style.display = 'flex';
    document.getElementById('logsView').style.display = 'none';
    document.getElementById('feedbackView').style.display = 'none';
    document.getElementById('titleActionsUsers').style.display = 'flex';
    document.getElementById('titleActionsLogs').style.display = 'none';
    document.getElementById('titleActionsFeedback').style.display = 'none';
    document.getElementById('mainTitle').textContent = 'Пользователи';
    document.getElementById('breadcrumbCurrent').textContent = 'Пользователи';
    renderStats();
    renderUsers();
    renderPagination();
    renderActiveFilter();
  } else if (currentNav === 'logs') {
    document.getElementById('usersView').style.display = 'none';
    document.getElementById('logsView').style.display = 'flex';
    document.getElementById('feedbackView').style.display = 'none';
    document.getElementById('titleActionsUsers').style.display = 'none';
    document.getElementById('titleActionsLogs').style.display = 'flex';
    document.getElementById('titleActionsFeedback').style.display = 'none';
    document.getElementById('mainTitle').textContent = 'Логи';
    document.getElementById('breadcrumbCurrent').textContent = 'Логи';
    renderLogsStats();
    renderLogs();
    renderLogsPagination();
    renderLogsActiveFilter();
  } else {
    document.getElementById('usersView').style.display = 'none';
    document.getElementById('logsView').style.display = 'none';
    document.getElementById('feedbackView').style.display = 'flex';
    document.getElementById('titleActionsUsers').style.display = 'none';
    document.getElementById('titleActionsLogs').style.display = 'none';
    document.getElementById('titleActionsFeedback').style.display = 'flex';
    document.getElementById('mainTitle').textContent = 'Обратная связь';
    document.getElementById('breadcrumbCurrent').textContent = 'Обратная связь';
    renderFeedbackStats();
    renderFeedback();
    renderFeedbackPagination();
    renderFeedbackActiveFilter();
  }
}

function renderNavBadge() {
  const badge = document.getElementById('navUsersBadge');
  if (badge) badge.textContent = users.length;
}

/* Отрисовка пользователей */
function renderStats() {
  const el = document.getElementById('adminStats');
  const s = computeStats();

  const iconUsers = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
  const iconCheck = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  const iconBlocked = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`;
  const iconCal = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

  const pluralUsers = (n) => plural(n, 'пользователь', 'пользователя', 'пользователей');
  const cls = (key) => `stat-card${currentFilter === key ? ' primary' : ''}`;

  el.innerHTML = `
    <button class="${cls('all')}" type="button" data-filter="all">
      <div class="stat-card-icon">${iconUsers}</div>
      <div class="stat-card-value">${s.total}<span class="unit">${pluralUsers(s.total)}</span></div>
      <div class="stat-card-label">Всего</div>
    </button>
    <button class="${cls('active')}" type="button" data-filter="active">
      <div class="stat-card-icon">${iconCheck}</div>
      <div class="stat-card-value">${s.active}<span class="unit">активных</span></div>
      <div class="stat-card-label">Активных</div>
    </button>
    <button class="${cls('blocked')}" type="button" data-filter="blocked">
      <div class="stat-card-icon">${iconBlocked}</div>
      <div class="stat-card-value">${s.blocked}<span class="unit">заблокировано</span></div>
      <div class="stat-card-label">Заблокировано</div>
    </button>
    <button class="${cls('recent')}" type="button" data-filter="recent">
      <div class="stat-card-icon">${iconCal}</div>
      <div class="stat-card-value">+${s.recent}<span class="unit">за 7 дней</span></div>
      <div class="stat-card-label">Новые</div>
    </button>
  `;

  el.querySelectorAll('.stat-card').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.getAttribute('data-filter');
      currentPage = 1;
      renderStats();
      renderUsers();
      renderPagination();
      renderActiveFilter();
    });
  });
}

function renderActiveFilter() {
  const el = document.getElementById('activeFilter');
  if (!el) return;
  if (currentFilter === 'all') { el.innerHTML = ''; return; }
  const labels = { active: 'активные', blocked: 'заблокированные', recent: 'новые за 7 дней' };
  el.innerHTML = `Фильтр: <b>${labels[currentFilter] || ''}</b>`;
}

function renderUsers() {
  const container = document.getElementById('usersList');
  const { pageItems, total } = getPageSlice();

  document.getElementById('titleCount').innerHTML =
    `<span class="num">${total}</span><span>${plural(total, 'запись', 'записи', 'записей')}</span>`;

  document.getElementById('searchClear').hidden = !currentSearch;

  if (!pageItems.length) {
    const hasFilter = currentFilter !== 'all' || currentSearch.trim();
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <h3>${hasFilter ? 'Ничего не найдено' : 'Пользователей пока нет'}</h3>
        <p>${hasFilter ? 'Сбросьте фильтр или измените запрос.' : 'Здесь появятся все, кто зарегистрируется в Wordbook.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = pageItems.map((u, idx) => {
    const globalIdx = (currentPage - 1) * PAGE_SIZE + idx + 1;
    const initial = (u.name.trim()[0] || '?').toUpperCase();
    const roleLabel = u.role === 'admin' ? 'Админ' : 'Читатель';
    const roleClass = u.role === 'admin' ? 'admin' : '';
    const blockedClass = u.blocked ? 'blocked' : '';
    const statusLabel = u.blocked ? 'Заблокирован' : 'Активен';
    const isAdmin = u.role === 'admin';

    return `
      <div class="user-row" data-id="${escapeHtml(u.name)}">
        <div class="row-num">${String(globalIdx).padStart(2, '0')}</div>

        <div class="user-cell-main">
          <div class="user-avatar-sm">${escapeHtml(initial)}</div>
          <div class="user-cell-name">
            <div class="n">${escapeHtml(u.name)}</div>
          </div>
        </div>

        <div class="col-role">
          <span class="role-badge ${roleClass}">${escapeHtml(roleLabel)}</span>
        </div>

        <div class="col-status">
          <span class="status-badge ${blockedClass}">
            <span class="status-dot"></span>
            ${escapeHtml(statusLabel)}
          </span>
        </div>

        <div class="col-date">
          <div class="date-cell">
            ${formatDate(u.createdAt)}
            ${u.createdAt ? `<span class="time">${formatTime(u.createdAt)}</span>` : ''}
          </div>
        </div>

        <div class="row-actions-admin">
          <button class="admin-action" type="button" data-action="view" data-name="${escapeHtml(u.name)}" title="Подробнее">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          ${isAdmin ? '' : `
          <button class="admin-action" type="button" data-action="toggle-block" data-name="${escapeHtml(u.name)}" title="${u.blocked ? 'Разблокировать' : 'Заблокировать'}">
            ${u.blocked
              ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`
              : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`}
          </button>
          `}
          ${isAdmin ? '' : `
          <button class="admin-action danger" type="button" data-action="delete" data-name="${escapeHtml(u.name)}" title="Удалить">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            </svg>
          </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

function renderPagination() {
  const el = document.getElementById('pagination');
  const { total, totalPages, start, end } = getPageSlice();

  if (totalPages <= 1) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;

  const cur = currentPage;
  const nums = getPageNumbers(cur, totalPages);
  const info = `<span class="page-info">Показано <b>${start + 1}–${Math.min(end, total)}</b> из <b>${total}</b></span>`;
  const prevBtn = `<button class="page-btn nav" type="button" data-page="prev" ${cur === 1 ? 'disabled' : ''} title="Назад"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>`;
  const nextBtn = `<button class="page-btn nav" type="button" data-page="next" ${cur === totalPages ? 'disabled' : ''} title="Вперёд"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>`;
  const numBtns = nums.map(n => {
    if (n === '...') return `<span class="page-dots">…</span>`;
    return `<button class="page-btn ${n === cur ? 'active' : ''}" type="button" data-page="${n}">${n}</button>`;
  }).join('');

  el.innerHTML = info + prevBtn + numBtns + nextBtn;
}

function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('...');
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);
  for (let i = from; i <= to; i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

/* Отрисовка логов */
function renderLogsStats() {
  const el = document.getElementById('logsStats');
  const s = computeLogStats();

  const iconAll = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
  const iconLock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  const iconTrash = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>`;
  const iconSys = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

  const pluralLogs = (n) => plural(n, 'запись', 'записи', 'записей');
  const cls = (key) => `stat-card${logFilter === key ? ' primary' : ''}`;

  el.innerHTML = `
    <button class="${cls('all')}" type="button" data-log-filter="all">
      <div class="stat-card-icon">${iconAll}</div>
      <div class="stat-card-value">${s.total}<span class="unit">${pluralLogs(s.total)}</span></div>
      <div class="stat-card-label">Всего</div>
    </button>
    <button class="${cls('blocks')}" type="button" data-log-filter="blocks">
      <div class="stat-card-icon">${iconLock}</div>
      <div class="stat-card-value">${s.blocks}<span class="unit">блокировок</span></div>
      <div class="stat-card-label">Блокировки</div>
    </button>
    <button class="${cls('deletes')}" type="button" data-log-filter="deletes">
      <div class="stat-card-icon">${iconTrash}</div>
      <div class="stat-card-value">${s.deletes}<span class="unit">удалений</span></div>
      <div class="stat-card-label">Удаления</div>
    </button>
    <button class="${cls('system')}" type="button" data-log-filter="system">
      <div class="stat-card-icon">${iconSys}</div>
      <div class="stat-card-value">${s.system}<span class="unit">системных</span></div>
      <div class="stat-card-label">Системные</div>
    </button>
  `;

  el.querySelectorAll('.stat-card').forEach(btn => {
    btn.addEventListener('click', () => {
      logFilter = btn.getAttribute('data-log-filter');
      logPage = 1;
      renderLogsStats();
      renderLogs();
      renderLogsPagination();
      renderLogsActiveFilter();
    });
  });
}

function renderLogsActiveFilter() {
  const el = document.getElementById('logsActiveFilter');
  if (!el) return;
  if (logFilter === 'all') { el.innerHTML = ''; return; }
  const labels = { blocks: 'блокировки', deletes: 'удаления', system: 'системные' };
  el.innerHTML = `Фильтр: <b>${labels[logFilter] || ''}</b>`;
}

function renderLogs() {
  const container = document.getElementById('logsList');
  const { pageItems, total } = getLogPageSlice();

  document.getElementById('titleCount').innerHTML =
    `<span class="num">${total}</span><span>${plural(total, 'запись', 'записи', 'записей')}</span>`;

  document.getElementById('logSearchClear').hidden = !logSearch;

  if (!pageItems.length) {
    const hasFilter = logFilter !== 'all' || logSearch.trim();
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/>
            <line x1="3" y1="12" x2="3.01" y2="12"/>
            <line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
        </div>
        <h3>${hasFilter ? 'Ничего не найдено' : 'Записей пока нет'}</h3>
        <p>${hasFilter ? 'Сбросьте фильтр или измените запрос.' : 'Здесь будут появляться действия администратора.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = pageItems.map(l => {
    const meta = LOG_TYPES[l.type] || {
      label: l.type, badgeClass: 'badge-info',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`,
    };
    const isSystem = l.target === 'Система';

    return `
      <div class="log-row">
        <div class="log-time">
          <span class="date-part">${formatDate(l.ts)}</span>
          <span class="time-part">${formatTime(l.ts)}</span>
        </div>
        <div>
          <span class="log-badge ${meta.badgeClass}">${meta.icon}${escapeHtml(meta.label)}</span>
        </div>
        <div class="log-target${isSystem ? ' system' : ''}">${escapeHtml(l.target)}</div>
        <div class="log-details" title="${escapeHtml(l.details)}">${escapeHtml(l.details)}</div>
      </div>
    `;
  }).join('');
}

function renderLogsPagination() {
  const el = document.getElementById('logsPagination');
  const { total, totalPages, start, end } = getLogPageSlice();

  if (totalPages <= 1) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;

  const cur = logPage;
  const nums = getPageNumbers(cur, totalPages);
  const info = `<span class="page-info">Показано <b>${start + 1}–${Math.min(end, total)}</b> из <b>${total}</b></span>`;
  const prevBtn = `<button class="page-btn nav" type="button" data-lpage="prev" ${cur === 1 ? 'disabled' : ''} title="Назад"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>`;
  const nextBtn = `<button class="page-btn nav" type="button" data-lpage="next" ${cur === totalPages ? 'disabled' : ''} title="Вперёд"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>`;
  const numBtns = nums.map(n => {
    if (n === '...') return `<span class="page-dots">…</span>`;
    return `<button class="page-btn ${n === cur ? 'active' : ''}" type="button" data-lpage="${n}">${n}</button>`;
  }).join('');

  el.innerHTML = info + prevBtn + numBtns + nextBtn;
}

/* Отрисовка обратной связи */
function computeFeedbackStats() {
  const total = feedbacks.length;
  const unread = feedbacks.filter(f => !f.read).length;
  const read = total - unread;
  return { total, unread, read };
}

function getFilteredFeedback() {
  let list = [...feedbacks];
  if (feedbackFilter === 'unread') list = list.filter(f => !f.read);
  else if (feedbackFilter === 'read') list = list.filter(f => f.read);

  if (feedbackSearch.trim()) {
    const q = feedbackSearch.trim().toLowerCase();
    list = list.filter(f =>
      (f.userName || '').toLowerCase().includes(q) ||
      (f.text || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function getFeedbackPageSlice() {
  const all = getFilteredFeedback();
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (feedbackPage > totalPages) feedbackPage = totalPages;
  if (feedbackPage < 1) feedbackPage = 1;
  const start = (feedbackPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  return { all, total, totalPages, start, end, pageItems: all.slice(start, end) };
}

function renderFeedbackStats() {
  const el = document.getElementById('feedbackStats');
  const s = computeFeedbackStats();

  const iconAll = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
  const iconUnread = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`;
  const iconRead = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

  const pluralMsgs = (n) => plural(n, 'сообщение', 'сообщения', 'сообщений');
  const cls = (key) => `stat-card${feedbackFilter === key ? ' primary' : ''}`;

  el.innerHTML = `
    <button class="${cls('all')}" type="button" data-feedback-filter="all">
      <div class="stat-card-icon">${iconAll}</div>
      <div class="stat-card-value">${s.total}<span class="unit">${pluralMsgs(s.total)}</span></div>
      <div class="stat-card-label">Всего</div>
    </button>
    <button class="${cls('unread')}" type="button" data-feedback-filter="unread">
      <div class="stat-card-icon">${iconUnread}</div>
      <div class="stat-card-value">${s.unread}<span class="unit">непрочитанных</span></div>
      <div class="stat-card-label">Непрочитанные</div>
    </button>
    <button class="${cls('read')}" type="button" data-feedback-filter="read">
      <div class="stat-card-icon">${iconRead}</div>
      <div class="stat-card-value">${s.read}<span class="unit">прочитанных</span></div>
      <div class="stat-card-label">Прочитанные</div>
    </button>
  `;

  el.querySelectorAll('.stat-card').forEach(btn => {
    btn.addEventListener('click', () => {
      feedbackFilter = btn.getAttribute('data-feedback-filter');
      feedbackPage = 1;
      renderFeedbackStats();
      renderFeedback();
      renderFeedbackPagination();
      renderFeedbackActiveFilter();
    });
  });
}

function renderFeedbackActiveFilter() {
  const el = document.getElementById('feedbackActiveFilter');
  if (!el) return;
  if (feedbackFilter === 'all') { el.innerHTML = ''; return; }
  const labels = { unread: 'непрочитанные', read: 'прочитанные' };
  el.innerHTML = `Фильтр: <b>${labels[feedbackFilter] || ''}</b>`;
}

function renderFeedback() {
  const container = document.getElementById('feedbackList');
  const { pageItems, total } = getFeedbackPageSlice();

  document.getElementById('titleCount').innerHTML =
    `<span class="num">${total}</span><span>${plural(total, 'сообщение', 'сообщения', 'сообщений')}</span>`;

  const clearBtn = document.getElementById('feedbackSearchClear');
  if (clearBtn) clearBtn.hidden = !feedbackSearch;

  if (!pageItems.length) {
    const hasFilter = feedbackFilter !== 'all' || feedbackSearch.trim();
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </div>
        <h3>${hasFilter ? 'Ничего не найдено' : 'Сообщений пока нет'}</h3>
        <p>${hasFilter ? 'Сбросьте фильтр или измените запрос.' : 'Здесь появятся сообщения от пользователей Wordbook.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = pageItems.map(f => {
    const initial = (String(f.userName || '?').trim()[0] || '?').toUpperCase();
    const unreadCls = f.read ? '' : ' unread';
    return `
      <div class="feedback-row${unreadCls}" data-id="${escapeHtml(f.id)}">
        <div class="user-cell-main">
          <div class="user-avatar-sm">${escapeHtml(initial)}</div>
          <div class="user-cell-name">
            <div class="n" style="font-size:15px;">${escapeHtml(f.userName || '—')}</div>
          </div>
        </div>
        <div class="feedback-time">
          <span class="date-part">${formatDate(f.ts)}</span>
          <span class="time-part">${formatTime(f.ts)}</span>
        </div>
        <div class="feedback-text" data-expand="${escapeHtml(f.id)}">${escapeHtml(f.text || '')}</div>
        <div class="feedback-actions">
          ${f.read ? '' : `
          <button class="admin-action" type="button" data-action="mark-read" data-id="${escapeHtml(f.id)}" title="Отметить прочитанным">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </button>
          `}
          <button class="admin-action danger" type="button" data-action="delete-feedback" data-id="${escapeHtml(f.id)}" title="Удалить">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderFeedbackPagination() {
  const el = document.getElementById('feedbackPagination');
  const { total, totalPages, start, end } = getFeedbackPageSlice();
  if (totalPages <= 1) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;

  const cur = feedbackPage;
  const nums = getPageNumbers(cur, totalPages);
  const info = `<span class="page-info">Показано <b>${start + 1}–${Math.min(end, total)}</b> из <b>${total}</b></span>`;
  const prevBtn = `<button class="page-btn nav" type="button" data-fpage="prev" ${cur === 1 ? 'disabled' : ''} title="Назад"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>`;
  const nextBtn = `<button class="page-btn nav" type="button" data-fpage="next" ${cur === totalPages ? 'disabled' : ''} title="Вперёд"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>`;
  const numBtns = nums.map(n => {
    if (n === '...') return `<span class="page-dots">…</span>`;
    return `<button class="page-btn ${n === cur ? 'active' : ''}" type="button" data-fpage="${n}">${n}</button>`;
  }).join('');
  el.innerHTML = info + prevBtn + numBtns + nextBtn;
}

/* События: пользователи */
document.getElementById('usersList').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.disabled || btn.classList.contains('is-loading')) return;

  const action = btn.getAttribute('data-action');
  const name = btn.getAttribute('data-name');
  const user = users.find(u => u.name === name);
  if (!user) return;
  if (user.role === 'admin' && action !== 'view') return;

  if (action === 'view') {
    openUserModal(user);
    return;
  }

  if (action === 'toggle-block') {
    await withLoading(btn, async () => {
      const newBlocked = !user.blocked;
      const ok = await fbUpdateUser(user.name, { blocked: newBlocked });

      if (!ok) {
        showToast('Не удалось обновить пользователя', 'error');
        return;
      }

      user.blocked = newBlocked;

      await fbAddLog(
        newBlocked ? 'block' : 'unblock',
        user.name,
        newBlocked ? 'Пользователь заблокирован' : 'Пользователь разблокирован'
      );
      await loadLogs();
      render();
    });
    return;
  }

  if (action === 'delete') {
    const ok = await showConfirm(
      `Пользователь «${user.name}» будет удалён. Это действие нельзя отменить.`,
      'Удалить пользователя?', 'Удалить'
    );
    if (!ok) return;

    await withLoading(btn, async () => {
      const deleted = await fbDeleteUser(user.name);
      if (!deleted) {
        showToast('Не удалось удалить пользователя', 'error');
        return;
      }
      await fbAddLog('delete', user.name, `Пользователь удалён (ID: ${user.id || user.name})`);
      await loadUsers();
      await loadLogs();
      const { totalPages } = getPageSlice();
      if (currentPage > totalPages) currentPage = totalPages;
      render();
    });
  }
});

document.getElementById('pagination').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-page]');
  if (!btn || btn.disabled) return;
  const val = btn.getAttribute('data-page');
  const totalPages = getPageSlice().totalPages;

  if (val === 'prev') currentPage = Math.max(1, currentPage - 1);
  else if (val === 'next') currentPage = Math.min(totalPages, currentPage + 1);
  else currentPage = Math.max(1, Math.min(totalPages, parseInt(val, 10)));

  renderUsers();
  renderPagination();
  const wrap = document.getElementById('usersList');
  if (wrap) wrap.scrollTop = 0;
});

document.getElementById('searchInput').addEventListener('input', (e) => {
  currentSearch = e.target.value;
  currentPage = 1;
  renderUsers();
  renderPagination();
});
document.getElementById('searchClear').addEventListener('click', () => {
  currentSearch = '';
  document.getElementById('searchInput').value = '';
  currentPage = 1;
  renderUsers();
  renderPagination();
});

document.getElementById('refreshBtn').addEventListener('click', async (e) => {
  await withLoading(e.currentTarget, async () => {
    await loadUsers();
    render();
  });
});

document.getElementById('exportBtn').addEventListener('click', async (e) => {
  await withLoading(e.currentTarget, async () => {
    const data = users.map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      blocked: u.blocked,
      createdAt: u.createdAt,
      registeredAt: formatDate(u.createdAt) + (u.createdAt ? ' ' + formatTime(u.createdAt) : ''),
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wordbook-users-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Экспортировано ${data.length} пользователей`, 'info', 3000);

    if (navigator.onLine !== false) {
      await fbAddLog('export', 'Система', `Экспортировано ${data.length} пользователей в JSON`);
      await loadLogs();
      render();
    }
  });
});

/* События: логи */
document.getElementById('logsPagination').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-lpage]');
  if (!btn || btn.disabled) return;
  const val = btn.getAttribute('data-lpage');
  const totalPages = getLogPageSlice().totalPages;

  if (val === 'prev') logPage = Math.max(1, logPage - 1);
  else if (val === 'next') logPage = Math.min(totalPages, logPage + 1);
  else logPage = Math.max(1, Math.min(totalPages, parseInt(val, 10)));

  renderLogs();
  renderLogsPagination();
  const wrap = document.getElementById('logsList');
  if (wrap) wrap.scrollTop = 0;
});

document.getElementById('logSearchInput').addEventListener('input', (e) => {
  logSearch = e.target.value;
  logPage = 1;
  renderLogs();
  renderLogsPagination();
});
document.getElementById('logSearchClear').addEventListener('click', () => {
  logSearch = '';
  document.getElementById('logSearchInput').value = '';
  logPage = 1;
  renderLogs();
  renderLogsPagination();
});

document.getElementById('refreshLogsBtn').addEventListener('click', async (e) => {
  await withLoading(e.currentTarget, async () => {
    await loadLogs();
    render();
  });
});

document.getElementById('clearLogsBtn').addEventListener('click', async (e) => {
  const ok = await showConfirm(
    'Все записи журнала будут удалены. Отменить это действие нельзя.',
    'Очистить логи?', 'Очистить'
  );
  if (!ok) return;
  await withLoading(e.currentTarget, async () => {
    await fbClearLogs();
    await fbAddLog('clearLogs', 'Система', 'Журнал очищен вручную');
    await loadLogs();
    render();
  });
});

/* События: обратная связь */
document.getElementById('feedbackList').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn) {
    e.stopPropagation();
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    const item = feedbacks.find(f => f.id === id);
    if (!item) return;

    if (action === 'mark-read') {
      await withLoading(btn, async () => {
        const ok = await fbMarkFeedbackRead(id, true);
        if (!ok) { showToast('Не удалось обновить', 'error'); return; }
        item.read = true;
        render();
      });
      return;
    }

    if (action === 'delete-feedback') {
      const ok = await showConfirm(
        `Сообщение от «${item.userName}» будет удалено безвозвратно.`,
        'Удалить сообщение?', 'Удалить'
      );
      if (!ok) return;
      await withLoading(btn, async () => {
        const deleted = await fbDeleteFeedback(id);
        if (!deleted) { showToast('Не удалось удалить', 'error'); return; }
        feedbacks = feedbacks.filter(f => f.id !== id);
        const { totalPages } = getFeedbackPageSlice();
        if (feedbackPage > totalPages) feedbackPage = totalPages;
        render();
      });
    }
    return;
  }

  const textEl = e.target.closest('[data-expand]');
  if (textEl) {
    textEl.closest('.feedback-row').classList.toggle('expanded');
  }
});

document.getElementById('feedbackPagination').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-fpage]');
  if (!btn || btn.disabled) return;
  const val = btn.getAttribute('data-fpage');
  const totalPages = getFeedbackPageSlice().totalPages;

  if (val === 'prev') feedbackPage = Math.max(1, feedbackPage - 1);
  else if (val === 'next') feedbackPage = Math.min(totalPages, feedbackPage + 1);
  else feedbackPage = Math.max(1, Math.min(totalPages, parseInt(val, 10)));

  renderFeedback();
  renderFeedbackPagination();
  const wrap = document.getElementById('feedbackList');
  if (wrap) wrap.scrollTop = 0;
});

document.getElementById('feedbackSearchInput').addEventListener('input', (e) => {
  feedbackSearch = e.target.value;
  feedbackPage = 1;
  renderFeedback();
  renderFeedbackPagination();
});

document.getElementById('feedbackSearchClear').addEventListener('click', () => {
  feedbackSearch = '';
  document.getElementById('feedbackSearchInput').value = '';
  feedbackPage = 1;
  renderFeedback();
  renderFeedbackPagination();
});

document.getElementById('refreshFeedbackBtn').addEventListener('click', async (e) => {
  await withLoading(e.currentTarget, async () => {
    await loadFeedback();
    render();
  });
});

/* Навигация */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    currentNav = item.getAttribute('data-nav');
    render();
  });
});

/* Тема */
document.getElementById('themeToggle').addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light';
  saveTheme(theme);
  applyTheme();
});

/* Модалки */
let confirmResolver = null;
const confirmModal = document.getElementById('confirmModal');
function showConfirm(text, title = 'Подтвердите', okText = 'Удалить') {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    document.getElementById('confirmText').textContent = text;
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmOk').textContent = okText;
    confirmModal.classList.add('show');
  });
}
function resolveConfirm(val) {
  confirmModal.classList.remove('show');
  if (confirmResolver) { confirmResolver(val); confirmResolver = null; }
}
document.getElementById('confirmOk').addEventListener('click', () => resolveConfirm(true));
document.getElementById('confirmCancel').addEventListener('click', () => resolveConfirm(false));
confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) resolveConfirm(false); });

const userModal = document.getElementById('userModal');
function openUserModal(user) {
  const role = user.role === 'admin' ? 'Администратор' : 'Читатель';
  const status = user.blocked ? 'Заблокирован' : 'Активен';
  const created = user.createdAt
    ? `${formatDate(user.createdAt)} в ${formatTime(user.createdAt)}`
    : 'дата неизвестна';

  document.getElementById('userModalTitle').textContent = user.name;
  document.getElementById('userModalText').innerHTML =
    `<b>ID:</b> ${escapeHtml(user.id || user.name)}<br>
     <b>Роль:</b> ${escapeHtml(role)}<br>
     <b>Статус:</b> ${escapeHtml(status)}<br>
     <b>Регистрация:</b> ${escapeHtml(created)}`;
  userModal.classList.add('show');
}
document.getElementById('userModalClose').addEventListener('click', () => userModal.classList.remove('show'));
userModal.addEventListener('click', (e) => { if (e.target === userModal) userModal.classList.remove('show'); });

/* Дропдаун пользователя */
function openUserDropdown() {
  document.getElementById('userCard').classList.add('open');
  document.getElementById('userCard').setAttribute('aria-expanded', 'true');
  document.getElementById('userDropdown').classList.add('show');
}
function closeUserDropdown() {
  document.getElementById('userCard').classList.remove('open');
  document.getElementById('userCard').setAttribute('aria-expanded', 'false');
  document.getElementById('userDropdown').classList.remove('show');
}
document.getElementById('userCard').addEventListener('click', (e) => {
  e.stopPropagation();
  const card = document.getElementById('userCard');
  if (card.classList.contains('open')) closeUserDropdown();
  else openUserDropdown();
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.user-wrap')) closeUserDropdown();
});

document.getElementById('menuBackToApp').addEventListener('click', (e) => {
  e.stopPropagation();
  closeUserDropdown();
  // Синхронизируем localStorage, чтобы словарь знал, кто мы
  if (currentUserData && currentUserData.name) {
    try { localStorage.setItem('wordbook_current_user', currentUserData.name); } catch (err) {}
  }
  window.location.href = '../dictionary/dictionary.html';
});

document.getElementById('menuAdminLogout').addEventListener('click', async (e) => {
  e.stopPropagation();
  closeUserDropdown();
  try { await firebase.auth().signOut(); } catch (err) {}
  // Чистим "текущего пользователя", чтобы после выхода словарь
  // не открывался от имени админа
  try { localStorage.removeItem('wordbook_current_user'); } catch (err) {}
  window.location.href = '../index.html';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeUserDropdown();
    userModal.classList.remove('show');
  }
});

/* Инициализация */
async function initApp() {
  const auth = firebase.auth();

  await new Promise(resolve => {
    const unsub = auth.onAuthStateChanged(() => { unsub(); resolve(); });
  });

  if (!auth.currentUser) {
    window.location.href = '../index.html';
    return;
  }

  await loadUsers();

  const adminUser = users.find(u => u.role === 'admin');
  const adminName = adminUser ? adminUser.name : (auth.currentUser.email || 'admin').split('@')[0];

  currentUserData = {
    name: adminName,
    email: auth.currentUser.email,
    role: 'admin',
  };

  document.getElementById('adminName').textContent = currentUserData.name;
  document.getElementById('adminInitial').textContent = (currentUserData.name[0] || 'A').toUpperCase();

  document.body.setAttribute('data-theme', theme);
  const label = document.getElementById('themeLabel');
  if (label) label.textContent = theme === 'light' ? 'Тёмная тема' : 'Светлая тема';

  await loadLogs();
  await loadFeedback();

  render();
}

function hidePreloader() {
  const preloader = document.getElementById('preloader');
  if (!preloader) return;
  preloader.classList.add('hide');
  setTimeout(() => {
    if (preloader.parentNode) preloader.parentNode.removeChild(preloader);
  }, 600);
}

function startPreloader() {
  const bar = document.getElementById('preloaderBar');
  const startTime = Date.now();

  const tick = () => {
    const target = Date.now() - startTime;
    const ratio = Math.min(1, target / PRELOADER_MIN_TIME);
    const eased = 1 - Math.pow(1 - ratio, 2);
    const progress = Math.min(100, Math.floor(eased * 100));
    if (bar) bar.style.width = progress + '%';
    if (target < PRELOADER_MIN_TIME) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  requestAnimationFrame(async () => {
    try {
      await initApp();
    } catch (e) {
      console.error('Init error:', e);
    }

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, PRELOADER_MIN_TIME - elapsed);
    setTimeout(() => {
      if (bar) bar.style.width = '100%';
      setTimeout(hidePreloader, 200);
    }, remaining);
  });
}

setTimeout(() => {
  const preloader = document.getElementById('preloader');
  if (preloader && !preloader.classList.contains('hide')) {
    hidePreloader();
  }
}, 5000);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startPreloader);
} else {
  startPreloader();
}