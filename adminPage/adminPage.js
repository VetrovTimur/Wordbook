const AUTH_KEY = 'wordbook_auth_v1';
const LOGS_KEY = 'wordbook_admin_logs_v1';
const ADMIN_THEME_KEY = 'wordbook_admin_theme';
const SEED_FLAG_KEY = 'wordbook_admin_seeded';
const PAGE_SIZE = 15;
const LOG_PAGE_SIZE = 20;
const MAX_LOGS = 500;
const PRELOADER_MIN_TIME = 2000;

let users = [];
let logs = [];
let currentSearch = '';
let currentFilter = 'all';
let currentPage = 1;

let currentNav = 'users';
let logSearch = '';
let logFilter = 'all';
let logPage = 1;

/* ============================================================
   Theme
   ============================================================ */
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

/* ============================================================
   Logs
   ============================================================ */
function loadLogs() {
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    if (raw) logs = JSON.parse(raw) || [];
    if (!Array.isArray(logs)) logs = [];
  } catch (e) { logs = []; }
}
function saveLogs() {
  try {
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
  } catch (e) {}
}
function addLog(type, target, details, ts) {
  logs.unshift({
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    ts: ts || Date.now(),
    type,
    target: target || '—',
    details: details || '',
  });
  if (logs.length > MAX_LOGS) logs = logs.slice(0, MAX_LOGS);
  saveLogs();
  updateLogsBadge();
}
function clearLogs() {
  logs = [];
  saveLogs();
  updateLogsBadge();
}

/* ============================================================
   Демо-логи
   ============================================================ */
function makeDemoLogs() {
  const now = Date.now();
  const min = 60000;
  const hour = 3600000;
  const day = 86400000;

  const templates = [
    ['unblock', 'Вера', 'Пользователь разблокирован', 3 * min],
    ['delete',  'Николай', 'Пользователь удалён (ID: u_nikolay)', 14 * min],
    ['block',   'Пётр', 'Пользователь заблокирован', 47 * min],

    ['block',   'Света', 'Пользователь заблокирован', 2 * hour + 12 * min],
    ['unblock', 'Света', 'Пользователь разблокирован', 2 * hour + 25 * min],
    ['export',  'Система', 'Экспортировано 18 пользователей в JSON', 4 * hour],
    ['seed',    'Система', 'Загружено 18 демонстрационных пользователей', 5 * hour + 30 * min],

    ['delete',  'Александр', 'Пользователь удалён (ID: u_alex)', 1 * day + 2 * hour],
    ['block',   'Максим', 'Пользователь заблокирован', 1 * day + 5 * hour],
    ['unblock', 'Максим', 'Пользователь разблокирован', 1 * day + 6 * hour],
    ['delete',  'Юлия', 'Пользователь удалён (ID: u_yulia)', 1 * day + 11 * hour],

    ['block',   'Николай', 'Пользователь заблокирован', 2 * day + 3 * hour],
    ['delete',  'Роман', 'Пользователь удалён (ID: u_roman)', 2 * day + 8 * hour],
    ['unblock', 'Ольга', 'Пользователь разблокирован', 2 * day + 14 * hour],
    ['block',   'Сергей', 'Пользователь заблокирован', 3 * day + 1 * hour],
    ['unblock', 'Сергей', 'Пользователь разблокирован', 3 * day + 3 * hour],
    ['export',  'Система', 'Экспортировано 15 пользователей в JSON', 3 * day + 7 * hour],

    ['block',   'Дмитрий', 'Пользователь заблокирован', 4 * day + 2 * hour],
    ['unblock', 'Дмитрий', 'Пользователь разблокирован', 4 * day + 5 * hour],
    ['delete',  'Катя', 'Пользователь удалён (ID: u_kate)', 5 * day + 4 * hour],
    ['clearLogs', 'Система', 'Журнал очищен вручную', 5 * day + 8 * hour],
    ['block',   'Ольга', 'Пользователь заблокирован', 6 * day + 3 * hour],
    ['unblock', 'Ольга', 'Пользователь разблокирован', 6 * day + 7 * hour],

    ['delete',  'Таня', 'Пользователь удалён (ID: u_tanya)', 8 * day + 5 * hour],
    ['block',   'Мария', 'Пользователь заблокирован', 9 * day + 1 * hour],
    ['unblock', 'Мария', 'Пользователь разблокирована', 9 * day + 4 * hour],
    ['export',  'Система', 'Экспортировано 12 пользователей в JSON', 10 * day + 6 * hour],
    ['delete',  'Иван', 'Пользователь удалён (ID: u_ivan)', 11 * day + 2 * hour],
    ['block',   'Анна', 'Пользователь заблокирован', 12 * day + 3 * hour],
    ['unblock', 'Анна', 'Пользователь разблокирована', 12 * day + 9 * hour],
    ['clearLogs', 'Система', 'Журнал очищен вручную', 13 * day],

    ['seed',    'Система', 'Загружено 10 демонстрационных пользователей', 18 * day + 4 * hour],
    ['delete',  'Елена', 'Пользователь удалён (ID: u_elena_old)', 20 * day + 6 * hour],
    ['block',   'Пётр', 'Пользователь заблокирован', 22 * day + 2 * hour],
    ['unblock', 'Пётр', 'Пользователь разблокирован', 22 * day + 5 * hour],
    ['export',  'Система', 'Экспортировано 8 пользователей в JSON', 25 * day + 1 * hour],
    ['delete',  'Олег', 'Пользователь удалён (ID: u_oleg)', 27 * day + 3 * hour],
    ['seed',    'Система', 'Загружено 5 демонстрационных пользователей', 30 * day],
  ];

  return templates.map(([type, target, details, ago], i) => ({
    id: 'demo_log_' + i + '_' + (now - ago),
    ts: now - ago,
    type,
    target,
    details,
  }));
}

function seedDemoLogs() {
  logs = makeDemoLogs();
  saveLogs();
  updateLogsBadge();
}

/* Метаданные для типов событий */
const LOG_TYPES = {
  seed: {
    label: 'Демо-данные',
    badgeClass: 'badge-accent',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  },
  clear: {
    label: 'Очистка',
    badgeClass: 'badge-danger',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>`,
  },
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

/* ============================================================
   Users data
   ============================================================ */
function makeDemoUsers() {
  const now = Date.now();
  const day = 86400000;
  const hour = 3600000;
  return [
    { id: 'u_reader',   name: 'Читатель',    role: 'admin', blocked: false, createdAt: now - 32 * day + 9 * hour },
    { id: 'u_anna',     name: 'Анна',        role: 'user',  blocked: false, createdAt: now - 27 * day + 14 * hour },
    { id: 'u_ivan',     name: 'Иван',        role: 'user',  blocked: false, createdAt: now - 24 * day + 10 * hour },
    { id: 'u_maria',    name: 'Мария',       role: 'user',  blocked: false, createdAt: now - 20 * day + 18 * hour },
    { id: 'u_petr',     name: 'Пётр',        role: 'user',  blocked: true,  createdAt: now - 17 * day + 11 * hour },
    { id: 'u_olga',     name: 'Ольга',       role: 'user',  blocked: false, createdAt: now - 14 * day + 20 * hour },
    { id: 'u_sergey',   name: 'Сергей',      role: 'user',  blocked: false, createdAt: now - 11 * day + 8 * hour },
    { id: 'u_elena',    name: 'Елена',       role: 'admin', blocked: false, createdAt: now - 9 * day + 15 * hour },
    { id: 'u_dmitry',   name: 'Дмитрий',     role: 'user',  blocked: false, createdAt: now - 6 * day + 12 * hour },
    { id: 'u_kate',     name: 'Катя',        role: 'user',  blocked: false, createdAt: now - 4 * day + 19 * hour },
    { id: 'u_nikolay',  name: 'Николай',     role: 'user',  blocked: true,  createdAt: now - 3 * day + 7 * hour },
    { id: 'u_sveta',    name: 'Света',       role: 'user',  blocked: false, createdAt: now - 2 * day + 13 * hour },
    { id: 'u_alex',     name: 'Александр',   role: 'user',  blocked: false, createdAt: now - 2 * day + 16 * hour },
    { id: 'u_tanya',    name: 'Таня',        role: 'user',  blocked: false, createdAt: now - 1 * day + 10 * hour },
    { id: 'u_max',      name: 'Максим',      role: 'user',  blocked: false, createdAt: now - 1 * day + 22 * hour },
    { id: 'u_yulia',    name: 'Юлия',        role: 'user',  blocked: false, createdAt: now - 14 * hour },
    { id: 'u_roman',    name: 'Роман',       role: 'user',  blocked: false, createdAt: now - 5 * hour },
    { id: 'u_vera',     name: 'Вера',        role: 'user',  blocked: false, createdAt: now - 2 * hour },
  ];
}

function loadUsers() {
  let list = [];
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.users) && parsed.users.length > 0) list = parsed.users;
    }
  } catch (e) {}

  users = list.map((u, i) => ({
    id: u.id || 'u_' + (u.name || 'user').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + i,
    name: u.name || 'Без имени',
    passHash: u.passHash || '',
    role: u.role || 'user',
    blocked: !!u.blocked,
    createdAt: u.createdAt || null,
  }));
}

function persistUsers() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    let parsed = raw ? JSON.parse(raw) : { users: [], current: null };
    if (!Array.isArray(parsed.users)) parsed.users = [];
    parsed.users = users.map(u => ({
      name: u.name,
      passHash: u.passHash,
      id: u.id,
      role: u.role,
      blocked: u.blocked,
      createdAt: u.createdAt,
    }));
    localStorage.setItem(AUTH_KEY, JSON.stringify(parsed));
  } catch (e) {}
}

function seedDemo() {
  users = makeDemoUsers();
  persistUsers();
  try { localStorage.setItem(SEED_FLAG_KEY, '1'); } catch (e) {}
  addLog('seed', 'Система', `Загружено ${users.length} демонстрационных пользователей`);
}

function clearUsers() {
  const count = users.length;
  users = [];
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    let parsed = raw ? JSON.parse(raw) : { users: [], current: null };
    parsed.users = [];
    localStorage.setItem(AUTH_KEY, JSON.stringify(parsed));
    localStorage.setItem(SEED_FLAG_KEY, '1');
  } catch (e) {}
  addLog('clear', 'Система', `Удалено ${count} пользователей`);
}

/* ============================================================
   Utils
   ============================================================ */
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

/* ============================================================
   Users stats / filter / pagination
   ============================================================ */
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
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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

/* ============================================================
   Logs stats / filter / pagination
   ============================================================ */
function computeLogStats() {
  const total = logs.length;
  const blocks = logs.filter(l => l.type === 'block' || l.type === 'unblock').length;
  const deletes = logs.filter(l => l.type === 'delete').length;
  const system = logs.filter(l => ['seed', 'clear', 'export', 'clearLogs'].includes(l.type)).length;
  return { total, blocks, deletes, system };
}

function getFilteredLogs() {
  let list = [...logs];
  if (logFilter === 'blocks') list = list.filter(l => l.type === 'block' || l.type === 'unblock');
  else if (logFilter === 'deletes') list = list.filter(l => l.type === 'delete');
  else if (logFilter === 'system') list = list.filter(l => ['seed', 'clear', 'export', 'clearLogs'].includes(l.type));

  if (logSearch.trim()) {
    const q = logSearch.trim().toLowerCase();
    list = list.filter(l =>
      l.target.toLowerCase().includes(q) ||
      l.details.toLowerCase().includes(q)
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

/* ============================================================
   Render root
   ============================================================ */
function render() {
  applyTheme();
  updateLogsBadge();
  renderNavBadge();

  if (currentNav === 'users') {
    document.getElementById('usersView').style.display = 'flex';
    document.getElementById('logsView').style.display = 'none';
    document.getElementById('titleActionsUsers').style.display = 'flex';
    document.getElementById('titleActionsLogs').style.display = 'none';
    document.getElementById('mainTitle').textContent = 'Пользователи';
    document.getElementById('breadcrumbCurrent').textContent = 'Пользователи';
    renderStats();
    renderUsers();
    renderPagination();
    renderActiveFilter();
  } else {
    document.getElementById('usersView').style.display = 'none';
    document.getElementById('logsView').style.display = 'flex';
    document.getElementById('titleActionsUsers').style.display = 'none';
    document.getElementById('titleActionsLogs').style.display = 'flex';
    document.getElementById('mainTitle').textContent = 'Логи';
    document.getElementById('breadcrumbCurrent').textContent = 'Логи';
    renderLogsStats();
    renderLogs();
    renderLogsPagination();
    renderLogsActiveFilter();
  }
}

function renderNavBadge() {
  const badge = document.getElementById('navUsersBadge');
  if (badge) badge.textContent = users.length;
}

/* ============================================================
   Render — users
   ============================================================ */
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
      const f = btn.getAttribute('data-filter');
      currentFilter = f;
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
        <p>${hasFilter ? 'Сбросьте фильтр или измените запрос.' : 'Откройте меню админа и выберите «Засеять демо-данными».'}</p>
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

    return `
      <div class="user-row" data-id="${escapeHtml(u.id)}">
        <div class="row-num">${String(globalIdx).padStart(2, '0')}</div>

        <div class="user-cell-main">
          <div class="user-avatar-sm">${escapeHtml(initial)}</div>
          <div class="user-cell-name">
            <div class="n">${escapeHtml(u.name)}</div>
            <div class="id">${escapeHtml(u.id)}</div>
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
          <button class="admin-action" type="button" data-action="view" data-id="${escapeHtml(u.id)}" title="Подробнее">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button class="admin-action" type="button" data-action="toggle-block" data-id="${escapeHtml(u.id)}" title="${u.blocked ? 'Разблокировать' : 'Заблокировать'}">
            ${u.blocked
              ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`
              : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`}
          </button>
          <button class="admin-action danger" type="button" data-action="delete" data-id="${escapeHtml(u.id)}" title="Удалить">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            </svg>
          </button>
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

/* ============================================================
   Render — logs
   ============================================================ */
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
        <p>${hasFilter ? 'Сбросьте фильтр или измените запрос.' : 'Загляните в меню админа и выберите «Засеять логи».'}</p>
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

/* ============================================================
   Users events
   ============================================================ */
document.getElementById('usersList').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const id = btn.getAttribute('data-id');
  const user = users.find(u => u.id === id);
  if (!user) return;

  if (action === 'view') {
    openUserModal(user);
  } else if (action === 'toggle-block') {
    user.blocked = !user.blocked;
    persistUsers();
    addLog(user.blocked ? 'block' : 'unblock', user.name, user.blocked ? `Пользователь заблокирован` : `Пользователь разблокирован`);
    render();
  } else if (action === 'delete') {
    const ok = await showConfirm(
      `Пользователь «${user.name}» будет удалён. Это действие нельзя отменить.`,
      'Удалить пользователя?', 'Удалить'
    );
    if (!ok) return;
    users = users.filter(u => u.id !== id);
    persistUsers();
    addLog('delete', user.name, `Пользователь удалён (ID: ${user.id})`);
    const { totalPages } = getPageSlice();
    if (currentPage > totalPages) currentPage = totalPages;
    render();
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

document.getElementById('refreshBtn').addEventListener('click', () => {
  loadUsers();
  render();
});

document.getElementById('exportBtn').addEventListener('click', () => {
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

  addLog('export', 'Система', `Экспортировано ${data.length} пользователей в JSON`);
  render();
});

/* ============================================================
   Logs events
   ============================================================ */
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

document.getElementById('refreshLogsBtn').addEventListener('click', () => {
  loadLogs();
  render();
});

document.getElementById('clearLogsBtn').addEventListener('click', async () => {
  const ok = await showConfirm(
    'Все записи журнала будут удалены. Отменить это действие нельзя.',
    'Очистить логи?', 'Очистить'
  );
  if (!ok) return;
  clearLogs();
  render();
});

/* ============================================================
   Nav
   ============================================================ */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    currentNav = item.getAttribute('data-nav');
    render();
  });
});

/* ============================================================
   Theme
   ============================================================ */
document.getElementById('themeToggle').addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light';
  saveTheme(theme);
  applyTheme();
});

/* ============================================================
   Modal
   ============================================================ */
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
    `<b>ID:</b> ${escapeHtml(user.id)}<br>
     <b>Роль:</b> ${escapeHtml(role)}<br>
     <b>Статус:</b> ${escapeHtml(status)}<br>
     <b>Регистрация:</b> ${escapeHtml(created)}`;
  userModal.classList.add('show');
}
document.getElementById('userModalClose').addEventListener('click', () => userModal.classList.remove('show'));
userModal.addEventListener('click', (e) => { if (e.target === userModal) userModal.classList.remove('show'); });

/* ============================================================
   User dropdown
   ============================================================ */
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
  window.location.href = 'index.html';
});

document.getElementById('menuSeed').addEventListener('click', async (e) => {
  e.stopPropagation();
  closeUserDropdown();
  const ok = await showConfirm(
    'Текущий список пользователей будет заменён демонстрационными данными (18 человек). Логи не тронутся.',
    'Засеять демо-данными?', 'Засеять'
  );
  if (!ok) return;
  seedDemo();
  currentFilter = 'all';
  currentPage = 1;
  render();
});

document.getElementById('menuSeedLogs').addEventListener('click', async (e) => {
  e.stopPropagation();
  closeUserDropdown();
  const ok = await showConfirm(
    'Текущие логи будут заменены набором из ~40 демонстрационных записей за последний месяц.',
    'Засеять демо-логами?', 'Засеять'
  );
  if (!ok) return;
  seedDemoLogs();
  logFilter = 'all';
  logPage = 1;
  render();
});

document.getElementById('menuClear').addEventListener('click', async (e) => {
  e.stopPropagation();
  closeUserDropdown();
  const ok = await showConfirm(
    'Все пользователи будут удалены из localStorage. Логи останутся. Отменить это действие нельзя.',
    'Очистить пользователей?', 'Очистить'
  );
  if (!ok) return;
  clearUsers();
  currentFilter = 'all';
  currentPage = 1;
  render();
});

/* ============================================================
   Escape
   ============================================================ */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeUserDropdown();
    userModal.classList.remove('show');
  }
});

/* ============================================================
   INIT + PRELOADER
   ============================================================ */
function initApp() {
  // Тема сразу — чтобы прелоадер был в правильной теме
  document.body.setAttribute('data-theme', theme);
  const label = document.getElementById('themeLabel');
  if (label) label.textContent = theme === 'light' ? 'Тёмная тема' : 'Светлая тема';

  loadLogs();
  loadUsers();

  // Первый вход: нет ни пользователей, ни логов — засеем всё
  const alreadySeeded = (() => {
    try { return localStorage.getItem(SEED_FLAG_KEY) === '1'; } catch (e) { return false; }
  })();

  if (!users.length && !alreadySeeded) {
    users = makeDemoUsers();
    persistUsers();
    try { localStorage.setItem(SEED_FLAG_KEY, '1'); } catch (e) {}
    logs = makeDemoLogs();
    saveLogs();
  }

  // Если пользователи есть, но логи пустые — тоже засеем
  if (users.length && !logs.length) {
    logs = makeDemoLogs();
    saveLogs();
  }

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

  // Плавное заполнение прогресс-бара
  const tick = () => {
    const target = Date.now() - startTime;
    const ratio = Math.min(1, target / PRELOADER_MIN_TIME);
    const eased = 1 - Math.pow(1 - ratio, 2);
    const progress = Math.min(100, Math.floor(eased * 100));
    if (bar) bar.style.width = progress + '%';
    if (target < PRELOADER_MIN_TIME) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);

  // Даём браузеру отрисовать прелоадер до инициализации
  requestAnimationFrame(() => {
    try {
      initApp();
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

// Страховка: если что-то пойдёт не так — прелоадер скроется через 5 секунд
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
