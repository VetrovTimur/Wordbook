const CURRENT_USER_KEY = 'wordbook_current_user';
const PAGE_SIZE = 15;
const CAL_DAYS_BEFORE = 10;
const CAL_DAYS_AFTER = 10;
const PRELOADER_MIN_TIME = 2000;

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

/* ============================================================
   Кто залогинен + локальные ссылки
   ============================================================ */
let currentUserName = null;
let currentUserData = null;
let state = JSON.parse(JSON.stringify(defaultState));

let shuffledOrder = [];
let currentSearch = '';
let editingWordId = null;
let lastAddedWordId = null;
let highlightTimer = null;
let saveDebounceTimer = null;

function getCurrentUser() {
  try { return localStorage.getItem(CURRENT_USER_KEY); } catch (e) { return null; }
}
function clearCurrentUser() {
  try { localStorage.removeItem(CURRENT_USER_KEY); } catch (e) {}
}

/* saveState: сразу кэш в localStorage, а в Firestore — с дебаунсом 400мс */
function saveState() {
  if (!currentUserName) return;
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    fbSaveState(currentUserName, state);
  }, 400);
}

/* ============================================================
   Утилиты (без изменений)
   ============================================================ */
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

/* ============================================================
   Статистика
   ============================================================ */
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
  if (!state.sections.length) { addBtn.disabled = true; addBtn.title = 'Сначала создайте раздел'; }
  else { addBtn.disabled = false; addBtn.title = ''; }

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

  // Скрыть "Сменить имя" — эта функция пока не работает с Firestore
  const renameBtn = document.getElementById('menuRename');
  if (renameBtn) renameBtn.style.display = 'none';

  // Переименовать "Сбросить имя" → "Выйти"
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
function openAddWordModal() {
  if (!state.sections.length) return;
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
});
inRu.addEventListener('input', () => {
  const cleaned = inRu.value.replace(RU_RE, '');
  if (cleaned !== inRu.value) inRu.value = cleaned;
  if (cleaned.trim()) { errRu.textContent = ''; inRu.classList.remove('error'); }
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
   INIT + PRELOADER (теперь async, с Firestore)
   ============================================================ */
async function initApp() {
  // 1. Кто залогинен
  currentUserName = getCurrentUser();
  if (!currentUserName) {
    window.location.href = '../index.html';
    return;
  }

  // 2. Загрузить юзера из Firestore
  const user = await fbGetUser(currentUserName);
  if (!user || user.blocked) {
    clearCurrentUser();
    window.location.href = '../index.html';
    return;
  }
  currentUserData = user;

  // 3. Загрузить state из Firestore
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

  // 4. Тема сразу
  document.body.setAttribute('data-theme', state.theme);

  // 5. Отрисовать
  markTodayVisited();
  render();
  renderUserMenu();
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