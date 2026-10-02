const CURRENT_USER_KEY = 'wordbook_current_user';
const PAGE_SIZE = 15;
const CAL_DAYS_BEFORE = 10;
const CAL_DAYS_AFTER = 10;
const PRELOADER_MIN_TIME = 1000;

const WORKER_URL = 'https://wordbook.timurworkvetrov.workers.dev/';
const TR_HINT_KEY_PREFIX = 'wordbook_tr_hint_shown_';

const defaultState = {
  theme: 'light',
  view: 'dictionary',
  userName: '',
  activeSectionId: 'all',
  shuffle: false,
  currentPage: 1,
  visits: [],
  calendarSeeded: false,
  sections: [],
  words: [],
};

let currentUserName = null;
let currentUserData = null;
let state = JSON.parse(JSON.stringify(defaultState));

let shuffledOrder = [];
let currentSearch = '';
let editingWordId = null;
let lastAddedWordId = null;
let highlightTimer = null;
let saveDebounceTimer = null;
let trFetchTimer = null;
let trAutoFilled = false;

function getCurrentUser() {
  try { return localStorage.getItem(CURRENT_USER_KEY); } catch (e) { return null; }
}
function clearCurrentUser() {
  try { localStorage.removeItem(CURRENT_USER_KEY); } catch (e) {}
}

/* Сохранение с дебаунсом */
function saveState() {
  if (!currentUserName) return;
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    fbSaveState(currentUserName, state);
  }, 400);
}

/* Утилиты */
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function markTodayVisited() {
  if (!Array.isArray(state.visits)) state.visits = [];
  const todayISO = toISO(new Date());
  if (!state.visits.includes(todayISO)) {
    state.visits.push(todayISO);
    saveState();
  }
}

function speak(text, lang, btnEl) {
  if (!('speechSynthesis' in window) || !text) return;
  try { window.speechSynthesis.cancel(); } catch (e) {}
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = lang === 'en' ? 'en-US' : 'ru-RU';
  utt.rate = 0.9;
  if (btnEl) {
    btnEl.classList.add('speaking');
    const stop = () => btnEl.classList.remove('speaking');
    utt.onend = stop; utt.onerror = stop;
  }
  try { window.speechSynthesis.speak(utt); } catch (e) {
    if (btnEl) btnEl.classList.remove('speaking');
  }
}

const uid = () => 'id_' + Math.random().toString(36).slice(2, 10);
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
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function getActiveSection() {
  if (state.activeSectionId === 'all') return null;
  return state.sections.find(s => s.id === state.activeSectionId) || null;
}
function getActiveSectionName() {
  const s = getActiveSection();
  return s ? s.name : 'Все слова';
}
function getFilteredWords() {
  let words = state.words;
  if (state.activeSectionId !== 'all') words = words.filter(w => w.sectionId === state.activeSectionId);
  if (currentSearch.trim()) {
    const q = currentSearch.trim().toLowerCase();
    words = words.filter(w =>
      w.en.toLowerCase().includes(q) ||
      w.ru.toLowerCase().includes(q) ||
      (w.tr || '').toLowerCase().includes(q)
    );
  }
  return words;
}
function applyShuffle(words) {
  if (!state.shuffle) return words;
  const currentIds = new Set(words.map(w => w.id));
  const validShuffled = shuffledOrder.filter(id => currentIds.has(id));
  const hasNew = words.some(w => !validShuffled.includes(w.id));
  if (validShuffled.length === 0 || hasNew) {
    shuffledOrder = shuffleArray(words.map(w => w.id));
  }
  const orderMap = new Map(shuffledOrder.map((id, i) => [id, i]));
  return [...words].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
}
function getAllVisibleWords() { return applyShuffle(getFilteredWords()); }
function getPageSlice() {
  const all = getAllVisibleWords();
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  if (state.currentPage < 1) state.currentPage = 1;
  const start = (state.currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  return { all, total, totalPages, start, end, pageWords: all.slice(start, end) };
}

/* Статистика */
function computeStats() {
  const today = new Date(); today.setHours(0,0,0,0);
  const uniq = [...new Set(state.visits)].sort();
  const set = new Set(uniq);

  let streak = 0;
  let cur = new Date(today);
  while (set.has(toISO(cur))) { streak++; cur.setDate(cur.getDate() - 1); if (streak > 3650) break; }

  let bestStreak = 0, run = 0, prevDate = null;
  for (const iso of uniq) {
    const d = new Date(iso + 'T00:00:00');
    if (prevDate && (d - prevDate) === 86400000) run++;
    else run = 1;
    if (run > bestStreak) bestStreak = run;
    prevDate = d;
  }

  let daysWithUs = 0;
  if (uniq.length) {
    const first = new Date(uniq[0] + 'T00:00:00');
    daysWithUs = Math.floor((today - first) / 86400000) + 1;
  }

  let missed = 0;
  if (uniq.length) {
    const first = new Date(uniq[0] + 'T00:00:00');
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    let d = new Date(first);
    while (d <= yesterday) { if (!set.has(toISO(d))) missed++; d.setDate(d.getDate() + 1); }
  }

  const wordsCount = state.words.length;
  const sectionsCount = state.sections.length;
  const avgWordsPerSection = sectionsCount > 0 ? (wordsCount / sectionsCount) : 0;

  return { streak, bestStreak, totalVisits: uniq.length, daysWithUs, missed, wordsCount, sectionsCount, avgWordsPerSection };
}

function renderStats() {
  const container = document.getElementById('wordList');
  const s = computeStats();

  const iconFire = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
  const iconTrophy = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>`;
  const iconCheck = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  const iconMiss = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  const iconBook = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
  const iconLayer = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
  const iconCal = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  const iconHash = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`;

  const cc = (p) => p ? 'stat-card primary' : 'stat-card';
  const pluralDays = (n) => plural(n, 'день', 'дня', 'дней');
  const pluralWords = (n) => plural(n, 'слово', 'слова', 'слов');
  const pluralSections = (n) => plural(n, 'раздел', 'раздела', 'разделов');
  const pluralVisits = (n) => plural(n, 'заход', 'захода', 'заходов');

  container.className = 'stats-view';
  container.innerHTML = `
    <div class="stats-intro">
      <p>Дневник ваших занятий со словарём</p>
    </div>
    <div class="stat-grid">
      <div class="${cc(true)}">
        <div class="stat-card-icon">${iconFire}</div>
        <div class="stat-card-value">${s.streak}<span class="unit">${pluralDays(s.streak)}</span></div>
        <div class="stat-card-label">Текущая серия</div>
      </div>
      <div class="${cc(false)}">
        <div class="stat-card-icon">${iconTrophy}</div>
        <div class="stat-card-value">${s.bestStreak}<span class="unit">${pluralDays(s.bestStreak)}</span></div>
        <div class="stat-card-label">Лучшая серия</div>
      </div>
      <div class="${cc(false)}">
        <div class="stat-card-icon">${iconCheck}</div>
        <div class="stat-card-value">${s.totalVisits}<span class="unit">${pluralVisits(s.totalVisits)}</span></div>
        <div class="stat-card-label">Всего заходов</div>
      </div>
      <div class="${cc(false)}">
        <div class="stat-card-icon">${iconMiss}</div>
        <div class="stat-card-value">${s.missed}<span class="unit">${pluralDays(s.missed)}</span></div>
        <div class="stat-card-label">Пропущено</div>
      </div>
      <div class="${cc(false)}">
        <div class="stat-card-icon">${iconCal}</div>
        <div class="stat-card-value">${s.daysWithUs}<span class="unit">${pluralDays(s.daysWithUs)}</span></div>
        <div class="stat-card-label">С нами</div>
      </div>
      <div class="${cc(false)}">
        <div class="stat-card-icon">${iconBook}</div>
        <div class="stat-card-value">${s.wordsCount}<span class="unit">${pluralWords(s.wordsCount)}</span></div>
        <div class="stat-card-label">В словаре</div>
      </div>
      <div class="${cc(false)}">
        <div class="stat-card-icon">${iconLayer}</div>
        <div class="stat-card-value">${s.sectionsCount}<span class="unit">${pluralSections(s.sectionsCount)}</span></div>
        <div class="stat-card-label">Разделов</div>
      </div>
      <div class="${cc(false)}">
        <div class="stat-card-icon">${iconHash}</div>
        <div class="stat-card-value">${s.avgWordsPerSection.toFixed(1)}</div>
        <div class="stat-card-label">Слов на раздел</div>
      </div>
    </div>
  `;
}

function renderCalendar() {
  const el = document.getElementById('calendar');
  const today = new Date(); today.setHours(0,0,0,0);
  const todayISO = toISO(today);
  const RU_DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const days = [];
  for (let i = -CAL_DAYS_BEFORE; i <= CAL_DAYS_AFTER; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i); days.push(d);
  }
  el.innerHTML = days.map(d => {
    const iso = toISO(d);
    const isToday = iso === todayISO;
    const isPast = d < today;
    const isFuture = d > today;
    const visited = state.visits.includes(iso);
    let cls = 'day';
    if (isToday) cls += ' day--today';
    else if (isFuture) cls += ' day--future';
    else if (isPast && visited) cls += ' day--past-visited';
    else if (isPast && !visited) cls += ' day--past-missed';
    return `<div class="${cls}" title="${iso}">
      <span class="dow">${RU_DOW[d.getDay()]}</span>
      <span class="dn">${d.getDate()}</span>
    </div>`;
  }).join('');

  requestAnimationFrame(() => {
    const todayEl = el.querySelector('.day--today');
    if (!todayEl) return;
    const wrapRect = el.getBoundingClientRect();
    const todayRect = todayEl.getBoundingClientRect();
    const targetScroll = el.scrollLeft + (todayRect.left - wrapRect.left)
                       - (wrapRect.width / 2) + (todayRect.width / 2);
    el.scrollTo({ left: Math.max(0, targetScroll), behavior: 'auto' });
  });
}

function render() {
  document.body.setAttribute('data-theme', state.theme);
  document.getElementById('themeLabel').textContent =
    state.theme === 'light' ? 'Тёмная тема' : 'Светлая тема';

  renderUserCard();
  document.body.classList.toggle('view-stats', state.view === 'stats');

  renderCalendar();
  renderAllWordsBlock();
  renderSections();
  renderAddSection();
  renderSectionSelect();

  if (state.view === 'stats') {
    document.getElementById('mainTitle').textContent = 'Статистика';
    document.getElementById('titleCount').classList.add('hidden');
    document.getElementById('titleCount').innerHTML = '';
    document.getElementById('pagination').hidden = true;
    document.getElementById('pagination').innerHTML = '';
    renderStats();
    updateMenuActive();
    return;
  }

  document.getElementById('titleCount').classList.remove('hidden');
  document.getElementById('wordList').className = 'word-list';
  renderWords();
  renderPagination();

  const addBtn = document.getElementById('addWordBtn');
  const importBtn = document.getElementById('importWordsBtn');
  const exportBtn = document.getElementById('exportWordsBtn');

  if (!state.sections.length) {
    addBtn.disabled = true; addBtn.title = 'Сначала создайте раздел';
    if (importBtn) { importBtn.disabled = true; importBtn.title = 'Сначала создайте раздел'; }
    if (exportBtn) { exportBtn.disabled = true; exportBtn.title = 'Нет слов для экспорта'; }
  } else {
    addBtn.disabled = false; addBtn.title = '';
    if (importBtn) { importBtn.disabled = false; importBtn.title = ''; }

    if (exportBtn) {
      const wordsInView = state.activeSectionId === 'all'
        ? state.words.length
        : state.words.filter(w => w.sectionId === state.activeSectionId).length;
      exportBtn.disabled = wordsInView === 0;
      exportBtn.title = wordsInView === 0 ? 'Нет слов для экспорта' : '';
    }
  }

  updateMenuActive();
}

function renderUserCard() {
  if (!currentUserData) return;
  const name = currentUserData.name || currentUserName || 'Читатель';
  document.getElementById('userName').textContent = name;
  document.getElementById('userInitial').textContent = (name[0] || 'Ч').toUpperCase();
  const roleEl = document.getElementById('userRole');
  if (roleEl) {
    roleEl.textContent = currentUserData.role === 'admin' ? 'админ' : 'читатель';
  }
}

function renderUserMenu() {
  const dd = document.getElementById('userDropdown');
  const isAdmin = currentUserData && currentUserData.role === 'admin';

  let adminItem = document.getElementById('menuAdmin');
  let adminDivider = document.getElementById('menuAdminDivider');

  if (isAdmin && !adminItem) {
    adminItem = document.createElement('button');
    adminItem.id = 'menuAdmin';
    adminItem.type = 'button';
    adminItem.className = 'dropdown-item';
    adminItem.setAttribute('role', 'menuitem');
    adminItem.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <span>Админ-панель</span>`;
    adminItem.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = '../adminPage/adminPage.html';
    });
    dd.insertBefore(adminItem, dd.firstChild);

    adminDivider = document.createElement('div');
    adminDivider.id = 'menuAdminDivider';
    adminDivider.className = 'dropdown-divider';
    dd.insertBefore(adminDivider, adminItem.nextSibling);
  } else if (!isAdmin && adminItem) {
    adminItem.remove();
    if (adminDivider) adminDivider.remove();
  }

  const logoutBtn = document.getElementById('menuLogout');
  if (logoutBtn) {
    const label = logoutBtn.querySelector('span');
    if (label) label.textContent = 'Выйти';
  }
}

function updateMenuActive() {
  const dict = document.getElementById('menuDict');
  const stats = document.getElementById('menuStats');
  if (!dict || !stats) return;
  dict.classList.toggle('active', state.view === 'dictionary');
  stats.classList.toggle('active', state.view === 'stats');
}

function renderAllWordsBlock() {
  const total = state.words.length;
  const isActive = state.activeSectionId === 'all' && state.view === 'dictionary';
  document.getElementById('allWordsBlock').innerHTML = `
    <div class="section-item section-item--all ${isActive ? 'active' : ''}" data-section-id="all">
      <div class="section-item-left">
        <div class="section-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
        </div>
        <span class="name">Все слова</span>
      </div>
      <div class="section-item-right">
        <span class="count">${total}</span>
      </div>
    </div>
  `;
}

function renderSections() {
  const list = document.getElementById('sectionsList');
  if (!state.sections.length) {
    list.innerHTML = `<div style="padding:10px 12px;font-size:14px;color:var(--ink-3);line-height:1.5;font-style:italic">
      Разделов пока нет.
    </div>`;
    return;
  }
  list.innerHTML = state.sections.map(s => {
    const count = state.words.filter(w => w.sectionId === s.id).length;
    const isActive = state.activeSectionId === s.id && state.view === 'dictionary';
    return `
      <div class="section-item ${isActive ? 'active' : ''}" data-section-id="${escapeHtml(s.id)}">
        <div class="section-item-left">
          <span class="dot"></span>
          <span class="name">${escapeHtml(s.name)}</span>
        </div>
        <div class="section-item-right">
          <button class="del-section" type="button" data-delete-section="${escapeHtml(s.id)}" title="Удалить">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
          <span class="count">${count}</span>
        </div>
      </div>
    `;
  }).join('');
}

let isAddingSection = false;
function renderAddSection() {
  const wrap = document.getElementById('addSectionWrap');
  if (!isAddingSection) {
    wrap.innerHTML = `
      <button class="add-section" id="addSectionBtn" type="button">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Новый раздел
      </button>
    `;
    wrap.querySelector('#addSectionBtn').addEventListener('click', () => {
      isAddingSection = true;
      renderAddSection();
      setTimeout(() => {
        const inp = document.getElementById('newSectionName');
        if (inp) { inp.focus(); inp.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      }, 30);
    });
  } else {
    wrap.innerHTML = `
      <div class="new-section-form">
        <input type="text" id="newSectionName" placeholder="Название..." autocomplete="off">
        <button class="icon-btn" id="newSectionOk" type="button" title="Создать">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </button>
        <button class="icon-btn danger" id="newSectionCancel" type="button" title="Отмена">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    `;
    const inp = document.getElementById('newSectionName');
    const ok = document.getElementById('newSectionOk');
    const cancel = document.getElementById('newSectionCancel');
    const submit = () => {
      const name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      if (state.sections.some(s => s.name.toLowerCase() === name.toLowerCase())) {
        inp.value = ''; inp.placeholder = 'Уже существует'; inp.focus(); return;
      }
      state.sections.push({ id: uid(), name });
      isAddingSection = false;
      saveState(); render();
    };
    ok.addEventListener('click', submit);
    cancel.addEventListener('click', () => { isAddingSection = false; renderAddSection(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { isAddingSection = false; renderAddSection(); }
    });
  }
}

function renderWords() {
  const container = document.getElementById('wordList');
  const { pageWords, total } = getPageSlice();

  document.getElementById('mainTitle').textContent = getActiveSectionName();
  document.getElementById('titleCount').innerHTML =
    `<span class="num">${total}</span><span>${plural(total, 'слово', 'слова', 'слов')}</span>`;

  document.getElementById('searchClear').hidden = !currentSearch;

  if (!pageWords.length) {
    const hasSections = state.sections.length > 0;
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
        </div>
        <h3>${currentSearch ? 'Ничего не найдено' : 'Страницы пусты'}</h3>
        <p>${currentSearch ? 'Попробуйте изменить запрос.' : hasSections ? 'Нажмите «Добавить слово», чтобы начать свой словарь.' : 'Сначала создайте раздел в панели слева.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = pageWords.map(w => {
    const cls = w.id === lastAddedWordId ? 'word-row highlight' : 'word-row';
    const trCell = w.tr ? `<span class="word-tr">${escapeHtml(w.tr)}</span>` : `<span class="word-tr empty">нет данных</span>`;
    return `
    <div class="${cls}" data-word-id="${escapeHtml(w.id)}">
      <div class="word-cell">
        <button class="speak-btn" type="button" data-speak="en" data-word-id="${escapeHtml(w.id)}" title="Прослушать">${speakerSvg()}</button>
        <span class="word-en">${escapeHtml(w.en)}</span>
      </div>
      <div class="word-cell">${trCell}</div>
      <div class="word-cell">
        <button class="speak-btn" type="button" data-speak="ru" data-word-id="${escapeHtml(w.id)}" title="Прослушать">${speakerSvg()}</button>
        <span class="word-ru">${escapeHtml(w.ru)}</span>
      </div>
      <div class="row-actions">
        <button class="action-btn" type="button" data-edit-word="${escapeHtml(w.id)}" title="Редактировать">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button class="action-btn danger" type="button" data-delete-word="${escapeHtml(w.id)}" title="Удалить">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  if (lastAddedWordId) {
    const el = container.querySelector(`[data-word-id="${lastAddedWordId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function renderPagination() {
  const el = document.getElementById('pagination');
  const { total, totalPages, start, end } = getPageSlice();
  if (totalPages <= 1) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const cur = state.currentPage;
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

function goToPage(n) {
  const { totalPages } = getPageSlice();
  const target = Math.max(1, Math.min(totalPages, n));
  if (target === state.currentPage) return;
  state.currentPage = target;
  saveState(); renderWords(); renderPagination();
  const list = document.getElementById('wordList');
  if (list) list.scrollTop = 0;
}

document.getElementById('pagination').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-page]');
  if (!btn || btn.disabled) return;
  const val = btn.getAttribute('data-page');
  if (val === 'prev') goToPage(state.currentPage - 1);
  else if (val === 'next') goToPage(state.currentPage + 1);
  else goToPage(parseInt(val, 10));
});

function speakerSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>`;
}

function renderSectionSelect() {
  const sel = document.getElementById('inSection');
  const prev = sel.value;
  sel.innerHTML = state.sections.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
  if (state.sections.some(s => s.id === prev)) sel.value = prev;
  else if (state.sections.some(s => s.id === state.activeSectionId)) sel.value = state.activeSectionId;
  else if (state.sections.length) sel.value = state.sections[0].id;
}

function openUserDropdown() {
  const card = document.getElementById('userCard');
  const dd = document.getElementById('userDropdown');
  card.classList.add('open');
  card.setAttribute('aria-expanded', 'true');
  dd.classList.add('show');
}
function closeUserDropdown() {
  const card = document.getElementById('userCard');
  const dd = document.getElementById('userDropdown');
  if (card) { card.classList.remove('open'); card.setAttribute('aria-expanded', 'false'); }
  if (dd) dd.classList.remove('show');
}
function toggleUserDropdown() {
  const card = document.getElementById('userCard');
  if (card.classList.contains('open')) closeUserDropdown();
  else openUserDropdown();
}

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

/* Подсказка про медленную транскрипцию */
function showTrHintIfNeeded() {
  if (!currentUserName) return;
  const key = TR_HINT_KEY_PREFIX + currentUserName;
  let shown = null;
  try { shown = localStorage.getItem(key); } catch (e) {}
  if (shown) return;

  const modal = document.getElementById('trHintModal');
  if (!modal) return;

  modal.classList.add('show');

  const close = () => {
    modal.classList.remove('show');
    try { localStorage.setItem(key, '1'); } catch (e) {}
  };

  document.getElementById('trHintOk').addEventListener('click', close, { once: true });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  }, { once: true });
}

document.querySelector('.sidebar').addEventListener('click', async (e) => {
  const delBtn = e.target.closest('[data-delete-section]');
  if (delBtn) {
    e.stopPropagation(); e.preventDefault();
    const id = delBtn.getAttribute('data-delete-section');
    const sec = state.sections.find(s => s.id === id);
    if (!sec) return;
    const ok = await showConfirm(
      `Раздел «${sec.name}» и все его слова будут удалены безвозвратно.`,
      'Удалить раздел?', 'Удалить'
    );
    if (!ok) return;
    state.sections = state.sections.filter(s => s.id !== id);
    state.words = state.words.filter(w => w.sectionId !== id);
    if (state.activeSectionId === id) state.activeSectionId = 'all';
    shuffledOrder = []; state.currentPage = 1;
    saveState(); render();
    return;
  }
  const item = e.target.closest('[data-section-id]');
  if (item) {
    const id = item.getAttribute('data-section-id');
    state.view = 'dictionary';
    if (state.activeSectionId !== id) {
      state.activeSectionId = id;
      shuffledOrder = []; state.currentPage = 1;
    }
    saveState(); render();
  }
});

document.getElementById('themeToggle').addEventListener('click', () => {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  saveState(); render();
});

document.getElementById('userCard').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleUserDropdown();
});

document.getElementById('menuDict').addEventListener('click', (e) => {
  e.stopPropagation();
  closeUserDropdown();
  state.view = 'dictionary';
  saveState(); render();
});

document.getElementById('menuStats').addEventListener('click', (e) => {
  e.stopPropagation();
  closeUserDropdown();
  state.view = 'stats';
  saveState(); render();
});

document.getElementById('menuLogout').addEventListener('click', async (e) => {
  e.stopPropagation();
  closeUserDropdown();
  const ok = await showConfirm(
    'Вы выйдете из аккаунта. Все данные сохранены в облаке.',
    'Выйти из аккаунта?', 'Выйти'
  );
  if (!ok) return;
  clearCurrentUser();
  window.location.href = '../index.html';
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.user-wrap')) closeUserDropdown();
});

document.getElementById('backToDictBtn').addEventListener('click', () => {
  state.view = 'dictionary';
  saveState(); render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeUserDropdown();
    if (wordModal.classList.contains('show')) closeWordModal();
    const trModal = document.getElementById('trHintModal');
    if (trModal && trModal.classList.contains('show')) {
      trModal.classList.remove('show');
      try { localStorage.setItem(TR_HINT_KEY_PREFIX + currentUserName, '1'); } catch (err) {}
    }
    const impModal = document.getElementById('importModal');
    if (impModal && impModal.classList.contains('show')) closeImportModal();
    const fbModal = document.getElementById('feedbackModal');
    if (fbModal && fbModal.classList.contains('show')) closeFeedbackModal();
    const wnModal = document.getElementById('whatsNewModal');
    if (wnModal && wnModal.classList.contains('show')) closeWhatsNewModal();
    const pwdModal = document.getElementById('passwordModal');
    if (pwdModal && pwdModal.classList.contains('show')) closePasswordModal();
  }
});

document.getElementById('searchInput').addEventListener('input', (e) => {
  currentSearch = e.target.value;
  state.currentPage = 1;
  renderWords(); renderPagination();
});
document.getElementById('searchClear').addEventListener('click', () => {
  currentSearch = '';
  document.getElementById('searchInput').value = '';
  state.currentPage = 1;
  renderWords(); renderPagination();
});

document.getElementById('shuffleBtn').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  btn.classList.remove('shuffling');
  void btn.offsetWidth;
  btn.classList.add('shuffling');
  setTimeout(() => btn.classList.remove('shuffling'), 550);

  state.shuffle = true;
  shuffledOrder = [];
  state.currentPage = 1;
  saveState();
  render();
});

document.getElementById('wordList').addEventListener('click', async (e) => {
  if (state.view === 'stats') return;

  const speakBtn = e.target.closest('[data-speak]');
  if (speakBtn) {
    e.preventDefault();
    const id = speakBtn.getAttribute('data-word-id');
    const w = state.words.find(x => x.id === id);
    if (!w) return;
    const lang = speakBtn.getAttribute('data-speak');
    speak(lang === 'en' ? w.en : w.ru, lang, speakBtn);
    return;
  }
  const delBtn = e.target.closest('[data-delete-word]');
  if (delBtn) {
    e.preventDefault();
    const id = delBtn.getAttribute('data-delete-word');
    const w = state.words.find(x => x.id === id);
    if (!w) return;
    const ok = await showConfirm(`Удалить слово «${w.en}»?`, 'Удалить слово?', 'Удалить');
    if (!ok) return;
    state.words = state.words.filter(x => x.id !== id);
    shuffledOrder = shuffledOrder.filter(x => x !== id);
    saveState();
    const { totalPages } = getPageSlice();
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    render();
    return;
  }
  const editBtn = e.target.closest('[data-edit-word]');
  if (editBtn) { e.preventDefault(); openEditWordModal(editBtn.getAttribute('data-edit-word')); }
});

const wordModal = document.getElementById('wordModal');
const inEn = document.getElementById('inEn');
const inTr = document.getElementById('inTr');
const inRu = document.getElementById('inRu');
const errEn = document.getElementById('errEn');
const errRu = document.getElementById('errRu');
const modalTitle = document.getElementById('modalTitle');
const saveWordBtn = document.getElementById('saveWord');

function resetErrors() {
  inEn.classList.remove('error'); inRu.classList.remove('error');
  errEn.textContent = ''; errRu.textContent = '';
}

async function fetchTranscription(word) {
  const w = word.trim().toLowerCase();
  if (w.length < 2) return null;

  const url = WORKER_URL + '?word=' + encodeURIComponent(w);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;
    for (const entry of data) {
      if (entry.phonetic) return entry.phonetic;
      if (Array.isArray(entry.phonetics)) {
        for (const p of entry.phonetics) {
          if (p.text) return p.text;
        }
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

function scheduleTranscriptionFetch() {
  if (trFetchTimer) clearTimeout(trFetchTimer);
  trFetchTimer = setTimeout(async () => {
    const en = inEn.value.trim();
    if (!en) return;
    if (inTr.value.trim() && !trAutoFilled) return;
    const tr = await fetchTranscription(en);
    if (tr && (!inTr.value.trim() || trAutoFilled)) {
      inTr.value = tr;
      trAutoFilled = true;
    }
  }, 600);
}

function openAddWordModal() {
  if (!state.sections.length) return;
  if (trFetchTimer) { clearTimeout(trFetchTimer); trFetchTimer = null; }
  trAutoFilled = false;
  editingWordId = null;
  modalTitle.textContent = 'Новое слово';
  saveWordBtn.textContent = 'Добавить';
  inEn.value = ''; inTr.value = ''; inRu.value = '';
  resetErrors(); renderSectionSelect();
  wordModal.classList.add('show');
  setTimeout(() => inEn.focus(), 60);
}
function openEditWordModal(wordId) {
  const w = state.words.find(x => x.id === wordId);
  if (!w) return;
  if (trFetchTimer) { clearTimeout(trFetchTimer); trFetchTimer = null; }
  trAutoFilled = false;
  editingWordId = wordId;
  modalTitle.textContent = 'Редактировать';
  saveWordBtn.textContent = 'Сохранить';
  inEn.value = w.en; inTr.value = w.tr || ''; inRu.value = w.ru;
  resetErrors(); renderSectionSelect();
  document.getElementById('inSection').value = w.sectionId;
  wordModal.classList.add('show');
  setTimeout(() => { inEn.focus(); inEn.select(); }, 60);
}
function closeWordModal() {
  wordModal.classList.remove('show');
  editingWordId = null;
  if (trFetchTimer) { clearTimeout(trFetchTimer); trFetchTimer = null; }
  trAutoFilled = false;
}
document.getElementById('addWordBtn').addEventListener('click', openAddWordModal);
document.getElementById('cancelWord').addEventListener('click', closeWordModal);
wordModal.addEventListener('click', (e) => { if (e.target === wordModal) closeWordModal(); });

const EN_RE = /[^a-zA-Z\s\-'.,!?()]/g;
const RU_RE = /[^а-яА-ЯёЁ\s\-'.,!?()]/g;

inEn.addEventListener('input', () => {
  const cleaned = inEn.value.replace(EN_RE, '');
  if (cleaned !== inEn.value) inEn.value = cleaned;
  if (cleaned.trim()) { errEn.textContent = ''; inEn.classList.remove('error'); }
  scheduleTranscriptionFetch();
});
inRu.addEventListener('input', () => {
  const cleaned = inRu.value.replace(RU_RE, '');
  if (cleaned !== inRu.value) inRu.value = cleaned;
  if (cleaned.trim()) { errRu.textContent = ''; inRu.classList.remove('error'); }
});
inTr.addEventListener('input', () => {
  trAutoFilled = false;
});

function handleSaveWord() {
  resetErrors();
  const en = inEn.value.trim();
  const tr = inTr.value.trim();
  const ru = inRu.value.trim();
  const sectionId = document.getElementById('inSection').value;

  let hasError = false;
  if (!en) { errEn.textContent = 'Введите английское слово'; inEn.classList.add('error'); hasError = true; }
  if (!ru) { errRu.textContent = 'Введите русский перевод'; inRu.classList.add('error'); hasError = true; }
  if (!sectionId) return;
  if (hasError) { (inEn.classList.contains('error') ? inEn : inRu).focus(); return; }

  if (editingWordId) {
    const w = state.words.find(x => x.id === editingWordId);
    if (w) { w.en = en; w.tr = tr; w.ru = ru; w.sectionId = sectionId; }
    lastAddedWordId = null;
  } else {
    const newWord = { id: uid(), sectionId, en, tr, ru };
    state.words.push(newWord);
    lastAddedWordId = newWord.id;
    shuffledOrder = [];
  }
  saveState();
  closeWordModal();

  const allVisible = getAllVisibleWords();
  const idx = allVisible.findIndex(x => x.id === lastAddedWordId);
  if (idx >= 0) { state.currentPage = Math.floor(idx / PAGE_SIZE) + 1; saveState(); }

  render();

  if (highlightTimer) clearTimeout(highlightTimer);
  if (lastAddedWordId) {
    highlightTimer = setTimeout(() => {
      lastAddedWordId = null;
      document.querySelectorAll('.word-row.highlight').forEach(el => el.classList.remove('highlight'));
    }, 1600);
  }
}
saveWordBtn.addEventListener('click', handleSaveWord);
[inEn, inTr, inRu].forEach(el => {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSaveWord(); }
  });
});

/* ============================================================
   ИМПОРТ СЛОВ (paste + xlsx/csv)
   ============================================================ */

const IMPORT_MAX = 100;
const IMPORT_PREVIEW_ROWS = 5;
const IMPORT_CHUNK = 20;

let importPending = null;
let importTab = 'paste';

/* ---------- Парсинг ---------- */

function detectDelimiter(line) {
  if (line.includes('\t')) return '\t';
  const semis = (line.match(/;/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  if (semis > commas && semis > 0) return ';';
  if (commas > 0) return ',';
  return '\t';
}

function parseCSVLine(line, delim) {
  if (delim === '\t') return line.split('\t');
  const parts = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === delim && !inQuotes) {
      parts.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  parts.push(cur);
  return parts;
}

const HEADER_WORDS = [
  'english', 'английский', 'en', 'слово', 'word',
  'transcription', 'транскрипция', 'tr',
  'russian', 'русский', 'ru', 'перевод',
  'section', 'раздел',
];

/* Очистка имени раздела: буквы/цифры/пробел/скобки.
   Всё остальное (эмодзи, дефис, подчёркивание, спецсимволы) → пробел. */
function sanitizeSectionName(raw) {
  let name = String(raw || '');
  // Заменяем всё, что не буква/цифра/пробел/скобки, на пробел.
  // \p{L} — любая буква (вкл. русские, é, ü, ñ), \p{N} — числа.
  name = name.replace(/[^\p{L}\p{N}\s()]/gu, ' ');
  // Схлопываем множественные пробелы
  name = name.replace(/\s+/g, ' ').trim();
  // Обрезаем до 50 символов
  if (name.length > 50) name = name.slice(0, 50).trim();
  return name;
}

function isHeaderRow(parts) {
  const first = String(parts[0] || '').toLowerCase().trim();
  if (!first) return false;
  return HEADER_WORDS.includes(first);
}

function parseRows2D(matrix) {
  const rows = [];
  let errors = 0;
  let headerChecked = false;

  for (let i = 0; i < matrix.length; i++) {
    const raw = matrix[i];
    if (!raw) continue;
    const parts = raw.map(p => String(p == null ? '' : p).trim());
    if (!parts.length) continue;
    if (parts.every(p => !p)) continue;

    if (!headerChecked) {
      headerChecked = true;
      if (isHeaderRow(parts)) continue;
    }

    const en = (parts[0] || '').trim();
    const tr = (parts[1] || '').trim();
    const ru = (parts[2] || '').trim();
    const sectionRaw = (parts[3] || '').trim();
    const section = sectionRaw ? sanitizeSectionName(sectionRaw) : '';

    if (!en || !ru) { errors++; continue; }
    rows.push({ en, tr, ru, section });
  }
  return { rows, errors };
}

function parseImportText(text) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { rows: [], errors: 0 };
  const delim = detectDelimiter(lines[0]);
  const matrix = lines.map(l => parseCSVLine(l, delim));
  return parseRows2D(matrix);
}

/* ---------- Lazy-load SheetJS с фолбэком ---------- */

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error('load fail: ' + url));
    document.head.appendChild(s);
  });
}

async function loadSheetJS() {
  if (window.XLSX) return true;
  const cdns = [
    'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
  ];
  for (const url of cdns) {
    try {
      await loadScript(url);
      if (window.XLSX) return true;
    } catch (e) { /* пробуем следующий */ }
  }
  throw new Error('Не удалось загрузить библиотеку XLSX');
}

async function parseXlsxFile(file) {
  await loadSheetJS();
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  return parseRows2D(matrix);
}

async function parseCsvFile(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let text = new TextDecoder('utf-8').decode(bytes);
  if (text.includes('\uFFFD')) {
    try { text = new TextDecoder('windows-1251').decode(bytes); } catch (e) {}
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return parseImportText(text);
}

/* ---------- Модалка ---------- */

function renderImportSectionSelect() {
  const sel = document.getElementById('importSection');
  if (!sel) return;
  sel.innerHTML = state.sections.map(s =>
    `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`
  ).join('');
  if (state.sections.some(s => s.id === state.activeSectionId)) {
    sel.value = state.activeSectionId;
  }
}

function resetImportModal() {
  importPending = null;
  importTab = 'paste';
  const tabs = document.querySelectorAll('.import-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'paste'));
  const pp = document.getElementById('importPanelPaste');
  const pf = document.getElementById('importPanelFile');
  if (pp) pp.hidden = false;
  if (pf) pf.hidden = true;
  const ta = document.getElementById('importTextarea');
  if (ta) ta.value = '';
  const fi = document.getElementById('importFileInput');
  if (fi) fi.value = '';
  const fn = document.getElementById('importFileName');
  if (fn) fn.textContent = '';
  const preview = document.getElementById('importPreview');
  if (preview) { preview.hidden = true; preview.innerHTML = ''; }
  const prog = document.getElementById('importProgress');
  if (prog) prog.hidden = true;
  const fill = prog && prog.querySelector('.import-progress-fill');
  if (fill) fill.style.width = '0%';
  const pt = prog && prog.querySelector('.import-progress-text');
  if (pt) pt.textContent = '';
  const cancelBtn = document.getElementById('importCancel');
  if (cancelBtn) cancelBtn.disabled = false;
  updateImportConfirmState();
}

function openImportModal() {
  if (!state.sections.length) {
    showToast('Сначала создайте раздел', 'warning');
    return;
  }
  resetImportModal();
  renderImportSectionSelect();
  document.getElementById('importModal').classList.add('show');
  setTimeout(() => {
    const ta = document.getElementById('importTextarea');
    if (ta) ta.focus();
  }, 80);
}

function closeImportModal() {
  document.getElementById('importModal').classList.remove('show');
  resetImportModal();
}

/* ---------- Превью ---------- */

function updateImportPreview() {
  const el = document.getElementById('importPreview');
  if (!el) return;

  if (!importPending || (!importPending.rows.length && !importPending.errors)) {
    el.hidden = true; el.innerHTML = '';
    updateImportConfirmState();
    return;
  }

  /* Дубли */
  const existing = new Set(state.words.map(w => String(w.en).toLowerCase().trim()));
  const seen = new Set();
  const unique = [];
  let dupes = 0;
  for (const r of importPending.rows) {
    const key = r.en.toLowerCase().trim();
    if (existing.has(key) || seen.has(key)) { dupes++; continue; }
    seen.add(key);
    unique.push(r);
  }
  importPending.uniqueRows = unique;
  importPending.dupes = dupes;

  /* Группировка по разделам */
  const hasSectionColumn = unique.some(r => r.section);
  const defaultSectionId = document.getElementById('importSection').value;
  const defaultSection = state.sections.find(s => s.id === defaultSectionId);
  const defaultSectionName = defaultSection ? defaultSection.name : 'Без раздела';

  const existingLower = new Map(state.sections.map(s => [s.name.toLowerCase(), s.name]));

  const groups = new Map();   // key -> { name, isNew, words[] }
  const orderedKeys = [];

  for (const r of unique) {
    const raw = (r.section || '').trim();
    let key, name, isNew;

    if (!raw) {
      key = '__default__';
      name = defaultSectionName;
      isNew = false;
    } else {
      key = raw.toLowerCase();
      const existingName = existingLower.get(key);
      if (existingName) {
        name = existingName;
        isNew = false;
      } else {
        name = raw;
        isNew = true;
      }
    }

    if (!groups.has(key)) {
      groups.set(key, { name, isNew, words: [] });
      orderedKeys.push(key);
    }
    groups.get(key).words.push(r);
  }

  const totalSections = groups.size;
  const newSections = [...groups.values()].filter(g => g.isNew).length;

  /* Сортируем группы: обычные по порядку появления, '__default__' — в конец */
  const sortedGroups = [...groups.entries()].sort((a, b) => {
    if (a[0] === '__default__') return 1;
    if (b[0] === '__default__') return -1;
    return orderedKeys.indexOf(a[0]) - orderedKeys.indexOf(b[0]);
  });

  const overLimit = unique.length > IMPORT_MAX;

  el.hidden = false;
  el.innerHTML = `
    <div class="import-stats">
      <div class="import-stat">
        <span class="import-stat-label">Готово</span>
        <span class="import-stat-value">${unique.length}</span>
      </div>
      <div class="import-stat">
        <span class="import-stat-label">Дубли</span>
        <span class="import-stat-value">${dupes}</span>
      </div>
      <div class="import-stat">
        <span class="import-stat-label">Ошибки</span>
        <span class="import-stat-value">${importPending.errors}</span>
      </div>
      ${hasSectionColumn ? `
      <div class="import-stat">
        <span class="import-stat-label">Разделов</span>
        <span class="import-stat-value">${totalSections}${newSections ? ` <span style="font-size:11px;color:var(--accent);font-style:italic;font-weight:600;">(+${newSections})</span>` : ''}</span>
      </div>` : ''}
    </div>
    ${overLimit ? `<div class="import-warning">Слишком много слов: ${unique.length}. Максимум за раз — ${IMPORT_MAX}.</div>` : ''}
    ${unique.length ? `
      <div class="import-preview-title">Предпросмотр</div>
      <div class="import-preview-table">
        ${sortedGroups.map(([key, g]) => `
          <div class="import-preview-group">
            <div class="import-preview-group-header">
              <div class="import-preview-group-title">
                ${key === '__default__'
                  ? `Раздел по умолчанию (${escapeHtml(g.name)})`
                  : escapeHtml(g.name)}
                ${g.isNew ? '<span class="import-preview-group-new">новый</span>' : ''}
              </div>
              <div class="import-preview-group-count">
                ${g.words.length} ${plural(g.words.length, 'слово', 'слова', 'слов')}
              </div>
            </div>
            <div class="import-preview-group-body">
              ${g.words.map(r => `
                <div class="import-preview-row">
                  <span class="ip-en">${escapeHtml(r.en)}</span>
                  <span class="ip-tr">${r.tr ? escapeHtml(r.tr) : '—'}</span>
                  <span class="ip-ru">${escapeHtml(r.ru)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;

  updateImportConfirmState();
}

function updateImportConfirmState() {
  const btn = document.getElementById('importConfirm');
  if (!btn) return;
  if (!importPending || !importPending.uniqueRows || !importPending.uniqueRows.length) {
    btn.disabled = true;
    btn.textContent = 'Импортировать';
    return;
  }
  const n = importPending.uniqueRows.length;
  if (n > IMPORT_MAX) {
    btn.disabled = true;
    btn.textContent = `Слишком много (${n})`;
    return;
  }
  btn.disabled = false;
  btn.textContent = `Импортировать ${n}`;
}

/* ---------- Выполнение импорта ---------- */

async function executeImport() {
  if (!importPending || !importPending.uniqueRows || !importPending.uniqueRows.length) return;
  const rows = importPending.uniqueRows.slice(0, IMPORT_MAX);
  const defaultSectionId = document.getElementById('importSection').value;
  if (!defaultSectionId) return;

  const prog = document.getElementById('importProgress');
  const fill = prog.querySelector('.import-progress-fill');
  const text = prog.querySelector('.import-progress-text');
  const confirmBtn = document.getElementById('importConfirm');
  const cancelBtn = document.getElementById('importCancel');

  prog.hidden = false;
  confirmBtn.disabled = true;
  cancelBtn.disabled = true;

  const total = rows.length;

  /* Кэш существующих разделов: lowercase name -> id */
  const sectionMap = new Map(state.sections.map(s => [s.name.toLowerCase(), s.id]));
  const createdSections = [];

  for (let i = 0; i < total; i++) {
    const r = rows[i];
    const raw = (r.section || '').trim();
    let sectionId;

    if (raw) {
      const key = raw.toLowerCase();
      if (!sectionMap.has(key)) {
        /* Создаём новый раздел — по порядку появления в файле */
        const newSection = { id: uid(), name: raw };
        state.sections.push(newSection);
        sectionMap.set(key, newSection.id);
        createdSections.push(newSection.name);
      }
      sectionId = sectionMap.get(key);
    } else {
      sectionId = defaultSectionId;
    }

    state.words.push({ id: uid(), sectionId, en: r.en, tr: r.tr, ru: r.ru });

    const done = i + 1;
    const pct = Math.round((done / total) * 100);
    fill.style.width = pct + '%';
    text.textContent = `Импортирую… ${done} из ${total}`;
    if (done % IMPORT_CHUNK === 0) {
      await new Promise(res => setTimeout(res, 0));
    }
  }

  fill.style.width = '100%';
  text.textContent = `Готово: ${total}`;

  shuffledOrder = [];
  state.currentPage = 1;
  state.view = 'dictionary';
  /* Если все слова ушли в один раздел — переходим туда, иначе — «Все слова» */
  const usedSectionIds = new Set(rows.map(r => {
    const raw = (r.section || '').trim();
    return raw ? sectionMap.get(raw.toLowerCase()) : defaultSectionId;
  }));
  state.activeSectionId = usedSectionIds.size === 1
    ? [...usedSectionIds][0]
    : 'all';
  saveState();
  render();

  const parts = [`Импортировано: ${total}`];
  if (importPending.dupes) parts.push(`дубли: ${importPending.dupes}`);
  if (importPending.errors) parts.push(`ошибки формата: ${importPending.errors}`);
  if (createdSections.length) parts.push(`разделов создано: ${createdSections.length}`);
  const type = total > 0 ? 'info' : 'warning';
  showToast(parts.join(' · '), type, 5000);

  setTimeout(closeImportModal, 500);
}

/* ---------- Обработчики ---------- */

document.getElementById('importWordsBtn').addEventListener('click', openImportModal);
document.getElementById('importCancel').addEventListener('click', closeImportModal);
document.getElementById('importModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('importModal')) closeImportModal();
});

document.querySelectorAll('.import-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    importTab = tab.dataset.tab;
    document.querySelectorAll('.import-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === importTab)
    );
    document.getElementById('importPanelPaste').hidden = importTab !== 'paste';
    document.getElementById('importPanelFile').hidden = importTab !== 'file';
  });
});

document.getElementById('importTextarea').addEventListener('input', (e) => {
  const { rows, errors } = parseImportText(e.target.value);
  importPending = { rows, errors };
  updateImportPreview();
});

document.getElementById('importFileInput').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const nameEl = document.getElementById('importFileName');
  nameEl.textContent = file.name;

  try {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    let result;
    if (ext === 'xlsx' || ext === 'xls') {
      result = await parseXlsxFile(file);
    } else if (ext === 'csv') {
      result = await parseCsvFile(file);
    } else {
      showToast('Поддерживаются .xlsx, .xls, .csv', 'warning');
      return;
    }
    importPending = result;
    updateImportPreview();
  } catch (err) {
    console.error('[Import]', err);
    showToast('Не удалось прочитать файл', 'error');
  }
});

const dropzone = document.getElementById('importDropzone');
if (dropzone) {
  ['dragenter', 'dragover'].forEach(ev => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(ev => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    const input = document.getElementById('importFileInput');
    const dt = new DataTransfer();
    dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  });
}

document.getElementById('importConfirm').addEventListener('click', executeImport);

/* ============================================================
   ЭКСПОРТ СЛОВ В CSV
   ============================================================ */

function exportWordsToCSV() {
  const isAll = state.activeSectionId === 'all';
  const words = isAll
    ? state.words
    : state.words.filter(w => w.sectionId === state.activeSectionId);

  if (!words.length) {
    showToast('Нет слов для экспорта', 'warning');
    return;
  }

  const esc = (v) => {
    const s = String(v ?? '');
    if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const headers = isAll
    ? ['english', 'transcription', 'russian', 'section']
    : ['english', 'transcription', 'russian'];

  const lines = [headers.join(';')];
  const sectionMap = new Map(state.sections.map(s => [s.id, s.name]));

  for (const w of words) {
    const row = [esc(w.en), esc(w.tr || ''), esc(w.ru)];
    if (isAll) row.push(esc(sectionMap.get(w.sectionId) || ''));
    lines.push(row.join(';'));
  }

  const csv = '\uFEFF' + lines.join('\r\n');

  const sectionName = getActiveSectionName();
  const date = new Date().toISOString().slice(0, 10);
  const slug = sectionName
    .toLowerCase()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50) || 'words';
  const fileName = `wordbook-${slug}-${date}.csv`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const wordWord = plural(words.length, 'слово', 'слова', 'слов');
  showToast(`Экспортировано ${words.length} ${wordWord}`, 'info', 3500);
}

document.getElementById('exportWordsBtn').addEventListener('click', exportWordsToCSV);

/* ============================================================
   ОБРАТНАЯ СВЯЗЬ
   ============================================================ */

const FEEDBACK_MAX = 2000;

const feedbackModal = document.getElementById('feedbackModal');
const feedbackText = document.getElementById('feedbackText');
const feedbackErr = document.getElementById('feedbackErr');
const feedbackCounter = document.getElementById('feedbackCounter');
const feedbackSendBtn = document.getElementById('feedbackSend');

function openFeedbackModal() {
  feedbackText.value = '';
  feedbackText.classList.remove('error');
  feedbackErr.textContent = '';
  feedbackSendBtn.disabled = false;
  feedbackSendBtn.textContent = 'Отправить';
  updateFeedbackCounter();
  feedbackModal.classList.add('show');
  setTimeout(() => feedbackText.focus(), 80);
}

function closeFeedbackModal() {
  feedbackModal.classList.remove('show');
}

function updateFeedbackCounter() {
  const len = feedbackText.value.length;
  feedbackCounter.textContent = `${len} / ${FEEDBACK_MAX}`;
  feedbackCounter.classList.toggle('warn', len > FEEDBACK_MAX * 0.9);
}

feedbackText.addEventListener('input', () => {
  if (feedbackText.classList.contains('error')) {
    feedbackText.classList.remove('error');
    feedbackErr.textContent = '';
  }
  updateFeedbackCounter();
});

feedbackText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    sendFeedback();
  }
});

async function sendFeedback() {
  const text = feedbackText.value.trim();

  if (!text) {
    feedbackText.classList.add('error');
    feedbackErr.textContent = 'Введите сообщение';
    feedbackText.focus();
    return;
  }
  if (text.length > FEEDBACK_MAX) {
    feedbackText.classList.add('error');
    feedbackErr.textContent = `Максимум ${FEEDBACK_MAX} символов`;
    feedbackText.focus();
    return;
  }

  feedbackSendBtn.disabled = true;
  feedbackSendBtn.textContent = 'Отправляю...';

  const ok = await fbAddFeedback(currentUserName, text);

  if (ok) {
    closeFeedbackModal();
    showToast('Сообщение отправлено. Спасибо!', 'info', 3500);
  } else {
    feedbackErr.textContent = 'Не удалось отправить. Попробуйте позже.';
    feedbackSendBtn.disabled = false;
    feedbackSendBtn.textContent = 'Отправить';
  }
}

document.getElementById('menuFeedback').addEventListener('click', (e) => {
  e.stopPropagation();
  closeUserDropdown();
  openFeedbackModal();
});
document.getElementById('feedbackCancel').addEventListener('click', closeFeedbackModal);
document.getElementById('feedbackSend').addEventListener('click', sendFeedback);
feedbackModal.addEventListener('click', (e) => {
  if (e.target === feedbackModal) closeFeedbackModal();
});

/* ============================================================
   ЧТО НОВОГО
   ============================================================ */

const UPDATES_VERSION = 1;
const UPDATES_KEY_PREFIX = 'wordbook_updates_seen_';

const UPDATES = [
  { type: 'feature', icon: 'chart',  title: 'Статистика занятий',           text: 'Серии заходов, лучший результат, дни с нами и пропуски — дневник ваших занятий.' },
  { type: 'feature', icon: 'import', title: 'Импорт слов из Excel',         text: 'Вставьте список или загрузите файл .xlsx / .csv, до 100 слов за раз.' },
  { type: 'feature', icon: 'search', title: 'Умный поиск',                  text: 'Ищите по слову, переводу или транскрипции.' },
  { type: 'improve', icon: 'mic',    title: 'Автоматическая транскрипция',  text: 'Вводите английское слово — произношение подставится само.' },
  { type: 'improve', icon: 'volume', title: 'Озвучка слов',                 text: 'Английский и русский в один клик, прямо из таблицы.' },
  { type: 'improve', icon: 'lock',   title: 'Безопасность аккаунтов',       text: 'SHA-256 хэш паролей, отдельный вход для администратора.' },
  { type: 'info',    icon: 'chat',   title: 'Обратная связь',               text: 'Прямая линия с администратором прямо из словаря.' },
  { type: 'info',    icon: 'moon',   title: 'Тёмная тема',                  text: 'Комфортное чтение днём и ночью.' },
  { type: 'fix',     icon: 'mobile', title: 'Фикс: разделы на мобильных',   text: 'Больше не пропадают при переключении страниц.' },
  { type: 'fix',     icon: 'zap',    title: 'Скорость и стабильность',      text: 'Аккуратные сохранения, кэш запросов, мягкие уведомления.' },
  { type: 'fix',     icon: 'shield', title: 'Защита данных',                text: 'Умные правила, разграничение прав доступа.' },
  { type: 'fix',     icon: 'star',   title: 'Чистый интерфейс',             text: 'Убрали лишнее, починили мелкие баги.' },
];

const UPDATE_ICONS = {
  chart:  '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  import: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  mic:    '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  lock:   '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  chat:   '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  moon:   '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  mobile: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  zap:    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  star:   '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
};

function getUpdatesSeenKey() {
  return UPDATES_KEY_PREFIX + (currentUserName || 'anon');
}
function getUpdatesSeen() {
  try {
    const v = localStorage.getItem(getUpdatesSeenKey());
    return v ? parseInt(v, 10) : 0;
  } catch (e) { return 0; }
}
function setUpdatesSeen() {
  try { localStorage.setItem(getUpdatesSeenKey(), String(UPDATES_VERSION)); } catch (e) {}
}

function updateWhatsNewBadge() {
  const badge = document.getElementById('whatsNewBadge');
  if (!badge) return;
  badge.hidden = !(UPDATES_VERSION > getUpdatesSeen());
}

function renderWhatsNew() {
  const grid = document.getElementById('whatsNewGrid');
  if (!grid) return;
  grid.innerHTML = UPDATES.map(u => `
    <div class="whats-new-card" data-type="${u.type}">
      <div class="whats-new-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          ${UPDATE_ICONS[u.icon] || UPDATE_ICONS.star}
        </svg>
      </div>
      <div class="whats-new-body">
        <div class="whats-new-title">${escapeHtml(u.title)}</div>
        <div class="whats-new-text">${escapeHtml(u.text)}</div>
      </div>
    </div>
  `).join('');
}

function openWhatsNewModal() {
  renderWhatsNew();
  document.getElementById('whatsNewModal').classList.add('show');
  setUpdatesSeen();
  updateWhatsNewBadge();
}
function closeWhatsNewModal() {
  document.getElementById('whatsNewModal').classList.remove('show');
}

document.getElementById('menuWhatsNew').addEventListener('click', (e) => {
  e.stopPropagation();
  closeUserDropdown();
  openWhatsNewModal();
});
document.getElementById('whatsNewOk').addEventListener('click', closeWhatsNewModal);
document.getElementById('whatsNewModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('whatsNewModal')) closeWhatsNewModal();
});

/* Инициализация */
async function initApp() {
  currentUserName = getCurrentUser();
  if (!currentUserName) {
    window.location.href = '../index.html';
    return;
  }

  const user = await fbGetUser(currentUserName);
  if (!user || user.blocked) {
    clearCurrentUser();
    window.location.href = '../index.html';
    return;
  }
  currentUserData = user;

  let cloudState = await fbLoadState(currentUserName);
  if (!cloudState) {
    cloudState = {
      theme: 'light',
      view: 'dictionary',
      userName: currentUserName,
      activeSectionId: 'all',
      shuffle: false,
      currentPage: 1,
      visits: [],
      calendarSeeded: false,
      sections: [],
      words: [],
    };
    await fbSaveState(currentUserName, cloudState);
  }
  state = { ...defaultState, ...cloudState };
  if (!state.userName) state.userName = currentUserName;

  document.body.setAttribute('data-theme', state.theme);

  markTodayVisited();

  /* Прогрев воркера — чтобы транскрипция грузилась быстрее */
  fetch(WORKER_URL + '?word=hello').catch(() => {});

  render();
  renderUserMenu();
  updateWhatsNewBadge();

  /* Показать подсказку после прелоадера, один раз */
  setTimeout(showTrHintIfNeeded, PRELOADER_MIN_TIME + 100);
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

/* ============================================================
   СМЕНА ПАРОЛЯ
   ============================================================ */

const PASSWORD_MIN = 6;

const passwordModal = document.getElementById('passwordModal');
const passwordCurrent = document.getElementById('passwordCurrent');
const passwordNew = document.getElementById('passwordNew');
const passwordConfirm = document.getElementById('passwordConfirm');
const passwordErrCurrent = document.getElementById('passwordErrCurrent');
const passwordErrNew = document.getElementById('passwordErrNew');
const passwordErrConfirm = document.getElementById('passwordErrConfirm');
const passwordSaveBtn = document.getElementById('passwordSave');

function resetPasswordErrors() {
  [passwordCurrent, passwordNew, passwordConfirm].forEach(el => el.classList.remove('error'));
  [passwordErrCurrent, passwordErrNew, passwordErrConfirm].forEach(el => el.textContent = '');
}

function openPasswordModal() {
  passwordCurrent.value = '';
  passwordNew.value = '';
  passwordConfirm.value = '';
  resetPasswordErrors();
  passwordSaveBtn.disabled = false;
  passwordSaveBtn.textContent = 'Сохранить';
  passwordModal.classList.add('show');
  setTimeout(() => passwordCurrent.focus(), 80);
}

function closePasswordModal() {
  passwordModal.classList.remove('show');
}

async function changePassword() {
  resetPasswordErrors();

  const cur = passwordCurrent.value;
  const nw = passwordNew.value;
  const cf = passwordConfirm.value;

  let hasError = false;

  if (!cur) {
    passwordErrCurrent.textContent = 'Введите текущий пароль';
    passwordCurrent.classList.add('error');
    hasError = true;
  }
  if (!nw) {
    passwordErrNew.textContent = 'Введите новый пароль';
    passwordNew.classList.add('error');
    hasError = true;
  } else if (nw.length < PASSWORD_MIN) {
    passwordErrNew.textContent = `Минимум ${PASSWORD_MIN} символов`;
    passwordNew.classList.add('error');
    hasError = true;
  } else if (nw === cur) {
    passwordErrNew.textContent = 'Новый пароль должен отличаться от текущего';
    passwordNew.classList.add('error');
    hasError = true;
  }
  if (!cf) {
    passwordErrConfirm.textContent = 'Повторите новый пароль';
    passwordConfirm.classList.add('error');
    hasError = true;
  } else if (cf !== nw) {
    passwordErrConfirm.textContent = 'Пароли не совпадают';
    passwordConfirm.classList.add('error');
    hasError = true;
  }
  if (hasError) return;

  passwordSaveBtn.disabled = true;
  passwordSaveBtn.textContent = 'Сохраняю...';

  try {
    const currentHash = await fbHashPassword(currentUserName, cur);
    if (currentUserData.passHash !== currentHash) {
      passwordErrCurrent.textContent = 'Неверный текущий пароль';
      passwordCurrent.classList.add('error');
      passwordCurrent.focus();
      return;
    }

    const newHash = await fbHashPassword(currentUserName, nw);
    const ok = await fbUpdateUser(currentUserName, { passHash: newHash });
    if (!ok) {
      passwordErrNew.textContent = 'Не удалось сохранить. Попробуйте позже.';
      return;
    }

    currentUserData.passHash = newHash;
    closePasswordModal();
    showToast('Пароль изменён', 'info', 3000);
  } finally {
    passwordSaveBtn.disabled = false;
    passwordSaveBtn.textContent = 'Сохранить';
  }
}

/* Кнопки и события */
document.getElementById('menuPassword').addEventListener('click', (e) => {
  e.stopPropagation();
  closeUserDropdown();
  openPasswordModal();
});
document.getElementById('passwordCancel').addEventListener('click', closePasswordModal);
document.getElementById('passwordSave').addEventListener('click', changePassword);
passwordModal.addEventListener('click', (e) => {
  if (e.target === passwordModal) closePasswordModal();
});

/* Сброс ошибки при вводе */
[
  [passwordCurrent, passwordErrCurrent],
  [passwordNew, passwordErrNew],
  [passwordConfirm, passwordErrConfirm],
].forEach(([input, err]) => {
  input.addEventListener('input', () => {
    if (input.classList.contains('error')) {
      input.classList.remove('error');
      err.textContent = '';
    }
  });
});

/* Enter — отправка */
[passwordCurrent, passwordNew, passwordConfirm].forEach(el => {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); changePassword(); }
  });
});

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