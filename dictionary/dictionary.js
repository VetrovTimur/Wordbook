/* ============================================================
   dictionary.js — структура файла:

   [1]  Константы и state
   [2]  Текущий пользователь + сохранение
   [3]  Цель дня
   [4]  Утилиты
   [5]  Статистика
   [6]  Календарь
   [7]  Главный render()
   [8]  Карточка пользователя и меню
   [9]  Сайдбар: разделы
   [10] Таблица слов
   [11] Пагинация
   [12] Утилиты рендера (speakerSvg, section select)
   [13] Дропдаун пользователя
   [14] Модалка confirm
   [15] Подсказка про транскрипцию
   [16] Обработчики: сайдбар, тема
   [17] Обработчики: меню, выход
   [18] Обработчики: клавиши, поиск, shuffle, список слов
   [19] Модалка слова
   [20] Авто-перевод RU → EN
   [21] Транскрипция
   [22] ФОНОВОЕ ДОЗАПОЛНЕНИЕ ТРАНСКРИПЦИИ - удалил (полностю, впизду)
   [23] Импорт слов
   [24] Экспорт CSV
   [25] Обратная связь
   [26] Поделиться
   [27] Что нового
   [28] Инициализация и прелоадер
   [29] Смена пароля
   [30] Модалка «Цель дня»
   [31] ТРЕНИРОВКА
   ============================================================ */

/* ============================================================
   [1] КОНСТАНТЫ И STATE
   ============================================================ */

const PAGE_SIZE = 15;
const CAL_DAYS_BEFORE = 10;
const CAL_DAYS_AFTER = 10;
const PRELOADER_MIN_TIME = 1000;

const TRANSLATE_WORKER_URL = 'https://wordbook-translate.timurworkvetrov.workers.dev/';
const TR_HINT_KEY_PREFIX = 'wordbook_hint_shown_v3_';

const POS_LABELS = {
  noun: 'Существительное', verb: 'Глагол', adj: 'Прилагательное',
  adv: 'Наречие', pron: 'Местоимение', prep: 'Предлог',
  conj: 'Союз', interj: 'Междометие', num: 'Числительное', art: 'Артикль',
};
const POS_SHORT = {
  noun: 'сущ.', verb: 'глаг.', adj: 'прил.', adv: 'нареч.',
  pron: 'мест.', prep: 'предл.', conj: 'союз', interj: 'межд.',
  num: 'числ.', art: 'арт.',
};

const defaultState = {
  theme: 'light',
  view: 'dictionary',
  userName: '',
  activeSectionId: 'all',
  shuffle: false,
  currentPage: 1,
  visits: [],
  sections: [],
  words: [],
  dailyGoal: 5,
  dailyProgress: {},
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
let trIsAI = false;
let trRuFetchTimer = null;
let enAutoFilled = false;

/* ============================================================
   [2] ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ + СОХРАНЕНИЕ
   ============================================================ */

function getCurrentUser() {
  try {
    return localStorage.getItem(CURRENT_USER_KEY)
        || sessionStorage.getItem(CURRENT_USER_KEY);
  } catch (e) { return null; }
}
function clearCurrentUser() {
  try {
    localStorage.removeItem(CURRENT_USER_KEY);
    sessionStorage.removeItem(CURRENT_USER_KEY);
  } catch (e) {}
}

/* Сохранение с дебаунсом */
function saveState() {
  if (!currentUserName) return;
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    fbSaveState(currentUserName, state);
  }, 400);
}

function markTodayVisited() {
  if (!Array.isArray(state.visits)) state.visits = [];
  const todayISO = toISO(new Date());
  if (!state.visits.includes(todayISO)) {
    state.visits.push(todayISO);
    saveState();
  }
}

/* ============================================================
   [3] ЦЕЛЬ ДНЯ
   ============================================================ */

function getTodayISO() { return toISO(new Date()); }

function getTodayProgress() {
  if (!state.dailyProgress || typeof state.dailyProgress !== 'object') {
    state.dailyProgress = {};
  }
  return state.dailyProgress[getTodayISO()] || null;
}

function ensureTodayProgress() {
  if (!state.dailyProgress || typeof state.dailyProgress !== 'object') {
    state.dailyProgress = {};
  }
  const today = getTodayISO();
  if (!state.dailyProgress[today]) {
    state.dailyProgress[today] = {
      added: 0,
      goal: state.dailyGoal || 5,
    };
  }
  return state.dailyProgress[today];
}

function markWordAdded(count = 1) {
  if (!state.dailyGoal || state.dailyGoal <= 0) return;
  const p = ensureTodayProgress();
  const before = p.added;
  p.added += count;
  saveState();

  if (p.added >= p.goal && before < p.goal) {
    const w = plural(p.added, 'слово', 'слова', 'слов');
    showToast(`🎯 Цель дня выполнена! ${p.added} ${w}`, 'info', 4000);
  }
}

function isDayVisited(iso) {
  const p = state.dailyProgress && state.dailyProgress[iso];
  if (p) return p.added >= p.goal;
  return Array.isArray(state.visits) && state.visits.includes(iso);
}

function renderGoalCard() {
  const card = document.getElementById('goalCard');
  if (!card) return;

  const goal = state.dailyGoal || 0;
  if (goal <= 0) { card.hidden = true; return; }
  card.hidden = false;

  const today = getTodayISO();
  const p = (state.dailyProgress && state.dailyProgress[today]) || { added: 0, goal };
  const added = p.added || 0;
  const done = added >= goal;
  const pct = Math.min(100, Math.round((added / goal) * 100));

  card.classList.toggle('done', done);

  const fill = document.getElementById('goalProgressFill');
  if (fill) fill.style.width = pct + '%';

  const doneIcon = document.getElementById('goalCardDone');
  if (doneIcon) doneIcon.hidden = !done;

  const text = document.getElementById('goalCardText');
  if (text) {
    const w = plural(goal, 'слово', 'слова', 'слов');
    text.textContent = `${added} из ${goal} ${w}`;
  }
}

/* ============================================================
   [4] УТИЛИТЫ
   ============================================================ */

function speak(text, lang, btnEl) {
  if (!('speechSynthesis' in window) || !text) return;

  try { window.speechSynthesis.cancel(); } catch (e) {}

  // Выбираем voice явно — иначе Chrome на Windows молчит,
  // если системная раскладка не совпадает с языком текста
  function pickVoice(targetLang) {
    const voices = window.speechSynthesis.getVoices() || [];
    const primary = targetLang.split('-')[0]; // en / ru
    // Сначала точное совпадение (en-US), потом просто по языку (en)
    return voices.find(v => v.lang === targetLang)
        || voices.find(v => v.lang.replace('_','-') === targetLang)
        || voices.find(v => v.lang.startsWith(primary))
        || null;
  }

  setTimeout(() => {
    const utt = new SpeechSynthesisUtterance(text);
    const targetLang = lang === 'en' ? 'en-US' : 'ru-RU';
    utt.lang = targetLang;

    const voice = pickVoice(targetLang);
    if (voice) utt.voice = voice;

    utt.rate = 0.9;

    if (btnEl) {
      btnEl.classList.add('speaking');
      const stop = () => btnEl.classList.remove('speaking');
      utt.onend = stop;
      utt.onerror = stop;
    }

    try { window.speechSynthesis.speak(utt); } catch (e) {
      if (btnEl) btnEl.classList.remove('speaking');
    }
  }, 50);
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
   [5] СТАТИСТИКА
   ============================================================ */

function computeStats() {
  const today = new Date(); today.setHours(0,0,0,0);

  const allDates = new Set();
  (Array.isArray(state.visits) ? state.visits : []).forEach(v => allDates.add(v));
  if (state.dailyProgress && typeof state.dailyProgress === 'object') {
    Object.keys(state.dailyProgress).forEach(k => allDates.add(k));
  }
  const uniq = [...allDates].sort();

  let streak = 0;
  let cur = new Date(today);
  while (isDayVisited(toISO(cur))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
    if (streak > 3650) break;
  }

  let bestStreak = 0, run = 0, prevDate = null;
  for (const iso of uniq) {
    if (!isDayVisited(iso)) { run = 0; prevDate = null; continue; }
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
    while (d <= yesterday) {
      if (!isDayVisited(toISO(d))) missed++;
      d.setDate(d.getDate() + 1);
    }
  }

  let totalVisits = 0;
  for (const iso of uniq) if (isDayVisited(iso)) totalVisits++;

  const wordsCount = state.words.length;
  const sectionsCount = state.sections.length;
  const avgWordsPerSection = sectionsCount > 0 ? (wordsCount / sectionsCount) : 0;

  return { streak, bestStreak, totalVisits, daysWithUs, missed, wordsCount, sectionsCount, avgWordsPerSection };
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

/* ============================================================
   [6] КАЛЕНДАРЬ
   ============================================================ */

function renderCalendar() {
  const el = document.getElementById('calendar');
  const today = new Date(); today.setHours(0,0,0,0);
  const todayISO = toISO(today);
  const RU_DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const days = [];
  for (let i = -CAL_DAYS_BEFORE; i <= CAL_DAYS_AFTER; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i); days.push(d);
  }

  const goalEnabled = (state.dailyGoal || 0) > 0;
  const todayProgress = getTodayProgress();
  let todayDone;
  if (goalEnabled) {
    todayDone = todayProgress
      ? todayProgress.added >= todayProgress.goal
      : false;
  } else {
    todayDone = Array.isArray(state.visits) && state.visits.includes(todayISO);
  }

  el.innerHTML = days.map(d => {
    const iso = toISO(d);
    const isToday = iso === todayISO;
    const isPast = d < today;
    const isFuture = d > today;

    let cls = 'day';
    if (isToday) {
      cls += (goalEnabled && !todayDone) ? ' day--today-pending' : ' day--today';
    } else if (isFuture) {
      cls += ' day--future';
    } else if (isPast) {
      cls += isDayVisited(iso) ? ' day--past-visited' : ' day--past-missed';
    }

    return `<div class="${cls}" title="${iso}">
      <span class="dow">${RU_DOW[d.getDay()]}</span>
      <span class="dn">${d.getDate()}</span>
    </div>`;
  }).join('');

  requestAnimationFrame(() => {
    const todayEl = el.querySelector('.day--today, .day--today-pending');
    if (!todayEl) return;
    const wrapRect = el.getBoundingClientRect();
    const todayRect = todayEl.getBoundingClientRect();
    const targetScroll = el.scrollLeft + (todayRect.left - wrapRect.left)
                       - (wrapRect.width / 2) + (todayRect.width / 2);
    el.scrollTo({ left: Math.max(0, targetScroll), behavior: 'auto' });
  });
}

/* ============================================================
   [7] ГЛАВНЫЙ RENDER()
   ============================================================ */

function render() {
  document.body.setAttribute('data-theme', state.theme);
  document.getElementById('themeLabel').textContent =
    state.theme === 'light' ? 'Тёмная тема' : 'Светлая тема';

    renderUserCard();
  document.body.classList.toggle('view-stats', state.view === 'stats');

  renderGoalCard();
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

/* ============================================================
   [8] КАРТОЧКА ПОЛЬЗОВАТЕЛЯ И МЕНЮ
   ============================================================ */

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

/* ============================================================
   [9] САЙДБАР: РАЗДЕЛЫ
   ============================================================ */

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
      const name = sanitizeSectionName(inp.value.trim());
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

/* ============================================================
   [10] ТАБЛИЦА СЛОВ
   ============================================================ */

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
        <p>${currentSearch ? 'Попробуйте изменить запрос.' : hasSections ? 'Нажмите «Добавить слово», чтобы начать свой словарь.' : 'Сначала создайте раздел.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = pageWords.map(w => {
    const cls = w.id === lastAddedWordId ? 'word-row highlight' : 'word-row';
        const aiBadge = w.trAI ? `<span class="word-tr-ai" title="Транскрипция от AI, может быть неточной">AI</span>` : '';
    const trCell = w.tr ? `<span class="word-tr">${escapeHtml(w.tr)}${aiBadge}</span>` : `<span class="word-tr empty">нет данных</span>`;
    const posBadge = w.pos && POS_SHORT[w.pos]
      ? `<span class="word-pos">${escapeHtml(POS_SHORT[w.pos])}</span>`
      : '';
    return `
    <div class="${cls}" data-word-id="${escapeHtml(w.id)}">
      <div class="word-cell">
        <button class="speak-btn" type="button" data-speak="en" data-word-id="${escapeHtml(w.id)}" title="Прослушать">${speakerSvg()}</button>
        <span class="word-en">${escapeHtml(w.en)}</span>
        ${posBadge}
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

/* ============================================================
   [11] ПАГИНАЦИЯ
   ============================================================ */

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

/* ============================================================
   [12] УТИЛИТЫ РЕНДЕРА (speakerSvg, section select)
   ============================================================ */

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

/* ============================================================
   [13] ДРОПДАУН ПОЛЬЗОВАТЕЛЯ
   ============================================================ */

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

/* ============================================================
   [14] МОДАЛКА CONFIRM
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

/* ============================================================
   [15] ПОДСКАЗКА ПРО МЕДЛЕННУЮ ТРАНСКРИПЦИЮ
   ============================================================ */

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

/* ============================================================
   [16] ОБРАБОТЧИКИ: САЙДБАР, ТЕМА
   ============================================================ */

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

/* ============================================================
   [17] ОБРАБОТЧИКИ: МЕНЮ, ВЫХОД
   ============================================================ */

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

/* ============================================================
   [18] ОБРАБОТЧИКИ: КЛАВИШИ, ПОИСК, SHUFFLE, СПИСОК СЛОВ
   ============================================================ */

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
     const gModal = document.getElementById('goalModal');
    if (gModal && gModal.classList.contains('show')) closeGoalModal();
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

/* ============================================================
   [19] МОДАЛКА СЛОВА
   ============================================================ */

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
  if (trFetchTimer) { clearTimeout(trFetchTimer); trFetchTimer = null; }
  if (trRuFetchTimer) { clearTimeout(trRuFetchTimer); trRuFetchTimer = null; }
    trAutoFilled = false;
  trIsAI = false;
  enAutoFilled = false;
  editingWordId = null;
  modalTitle.textContent = 'Новое слово';
  saveWordBtn.textContent = 'Добавить';
  inEn.value = ''; inTr.value = ''; inRu.value = '';
  const posSel = document.getElementById('inPos');
  if (posSel) posSel.value = '';
  resetErrors(); renderSectionSelect();
  wordModal.classList.add('show');
  setTimeout(() => inRu.focus(), 60);
}
function openEditWordModal(wordId) {
  const w = state.words.find(x => x.id === wordId);
  if (!w) return;
  if (trFetchTimer) { clearTimeout(trFetchTimer); trFetchTimer = null; }
  if (trRuFetchTimer) { clearTimeout(trRuFetchTimer); trRuFetchTimer = null; }
    trAutoFilled = false;
  trIsAI = w.trAI === true;
  enAutoFilled = false;
  editingWordId = wordId;
  modalTitle.textContent = 'Редактировать';
  saveWordBtn.textContent = 'Сохранить';
  inEn.value = w.en; inTr.value = w.tr || ''; inRu.value = w.ru;
  const posSel = document.getElementById('inPos');
  if (posSel) posSel.value = w.pos || '';
  resetErrors(); renderSectionSelect();
  document.getElementById('inSection').value = w.sectionId;
  wordModal.classList.add('show');
  setTimeout(() => { inRu.focus(); inRu.select(); }, 60);
}
function closeWordModal() {
  wordModal.classList.remove('show');
  editingWordId = null;
  if (trFetchTimer) { clearTimeout(trFetchTimer); trFetchTimer = null; }
  if (trRuFetchTimer) { clearTimeout(trRuFetchTimer); trRuFetchTimer = null; }
   trAutoFilled = false;
  trIsAI = false;
  enAutoFilled = false;
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
  enAutoFilled = false;
  scheduleTranscriptionFetch();
});
inRu.addEventListener('input', () => {
  const cleaned = inRu.value.replace(RU_RE, '');
  if (cleaned !== inRu.value) inRu.value = cleaned;
  if (cleaned.trim()) { errRu.textContent = ''; inRu.classList.remove('error'); }
  scheduleTranslationFetch();
});
inTr.addEventListener('input', () => {
  trAutoFilled = false;
  trIsAI = false;
});

function handleSaveWord() {
  resetErrors();
  const en = inEn.value.trim().toLowerCase();
  const tr = inTr.value.trim();
  const ru = inRu.value.trim().toLowerCase();
  const sectionId = document.getElementById('inSection').value;
  const posSel = document.getElementById('inPos');
  const pos = posSel ? posSel.value : '';

  let hasError = false;
  if (!en) { errEn.textContent = 'Введите английское слово'; inEn.classList.add('error'); hasError = true; }
  if (!ru) { errRu.textContent = 'Введите русский перевод'; inRu.classList.add('error'); hasError = true; }
  if (!sectionId) return;
  if (hasError) { (inRu.classList.contains('error') ? inRu : inEn).focus(); return; }

    if (editingWordId) {
    const w = state.words.find(x => x.id === editingWordId);
    if (w) { w.en = en; w.tr = tr; w.ru = ru; w.sectionId = sectionId; w.pos = pos; w.trAI = tr ? trIsAI : false; }
    lastAddedWordId = null;
    } else {
    const newWord = { id: uid(), sectionId, en, tr, ru, pos, trAI: tr ? trIsAI : false };
    state.words.push(newWord);
    lastAddedWordId = newWord.id;
    shuffledOrder = [];
    markWordAdded(1);
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
   [20] АВТО-ПЕРЕВОД RU → EN
   ============================================================ */

async function fetchTranslation(word) {
  const w = String(word || '').trim();
  if (w.length < 2) return null;

  const url = TRANSLATE_WORKER_URL + '?word=' + encodeURIComponent(w);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data.en === 'string' && data.en.trim()) {
      const posRaw = typeof data.pos === 'string' ? data.pos : '';
      return {
        en: data.en.trim().toLowerCase(),
        pos: POS_LABELS[posRaw] ? posRaw : '',
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

function scheduleTranslationFetch() {
  if (trRuFetchTimer) clearTimeout(trRuFetchTimer);
  trRuFetchTimer = setTimeout(async () => {
    const ru = inRu.value.trim();
    if (!ru) return;

    if (inEn.value.trim() && !enAutoFilled) return;

    const result = await fetchTranslation(ru);
    if (result && (!inEn.value.trim() || enAutoFilled)) {
      inEn.value = result.en;
      enAutoFilled = true;
      errEn.textContent = '';
      inEn.classList.remove('error');

      const posSel = document.getElementById('inPos');
      if (posSel && result.pos && !posSel.value) {
        posSel.value = result.pos;
      }

      scheduleTranscriptionFetch();
    }
  }, 600);
}

/* ============================================================
   [21] ТРАНСКРИПЦИЯ
   ============================================================ */

async function fetchTranscription(word) {
  const w = word.trim().toLowerCase();
  if (w.length < 2) return null;

  // Только AI через wordbook-translate
  const url = TRANSLATE_WORKER_URL + '?mode=phonetic&word=' + encodeURIComponent(w);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data.phonetic === 'string' && data.phonetic.trim()) {
      if (data.word && data.word.toLowerCase() !== w) return null;
      return { tr: data.phonetic.trim(), ai: true };
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

    const delays = [0, 1500, 3500];
    let result = null;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i]) await new Promise(r => setTimeout(r, delays[i]));
      if (inEn.value.trim() !== en) return;
      if (inTr.value.trim() && !trAutoFilled) return;
      result = await fetchTranscription(en);
      if (result && result.tr) break;
    }

    if (result && result.tr && (!inTr.value.trim() || trAutoFilled)) {
      inTr.value = result.tr;
      trAutoFilled = true;
      trIsAI = result.ai;
    }
  }, 600);
}

/* ============================================================
   [23] ИМПОРТ СЛОВ (paste + xlsx/csv)
   ============================================================ */

const IMPORT_MAX = 100;
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
  'pos', 'part of speech', 'part', 'speech', 'часть речи',
];

const POS_INPUT_ALIASES = {
  'сущ': 'noun', 'существительное': 'noun',
  'глаг': 'verb', 'глагол': 'verb',
  'прил': 'adj', 'прилагательное': 'adj',
  'нареч': 'adv', 'наречие': 'adv',
  'мест': 'pron', 'местоимение': 'pron',
  'предл': 'prep', 'предлог': 'prep',
  'союз': 'conj',
  'межд': 'interj', 'междометие': 'interj',
  'числ': 'num', 'числительное': 'num',
  'арт': 'art', 'артикль': 'art',
  'noun': 'noun', 'n': 'noun',
  'verb': 'verb', 'v': 'verb',
  'adj': 'adj', 'adjective': 'adj',
  'adv': 'adv', 'adverb': 'adv',
  'pron': 'pron', 'pronoun': 'pron',
  'prep': 'prep', 'preposition': 'prep',
  'conj': 'conj', 'conjunction': 'conj',
  'interj': 'interj', 'interjection': 'interj',
  'num': 'num', 'numeral': 'num',
  'art': 'art', 'article': 'art',
};

function normalizePos(raw) {
  if (!raw) return '';
  const key = String(raw).toLowerCase().trim()
    .replace(/\.$/, '')
    .replace(/\s+/g, ' ');
  return POS_INPUT_ALIASES[key] || '';
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

    const cols = parts.length;
    let en = '', tr = '', ru = '', pos = '', sectionRaw = '';

    if (cols === 2) {
      en = parts[0]; ru = parts[1];
    } else if (cols === 3) {
      en = parts[0]; tr = parts[1]; ru = parts[2];
    } else if (cols === 4) {
      en = parts[0]; tr = parts[1]; ru = parts[2];
      const fourth = parts[3];
      const asPos = normalizePos(fourth);
      if (asPos) pos = asPos;
      else sectionRaw = fourth;
    } else {
      en = parts[0]; tr = parts[1]; ru = parts[2];
      pos = normalizePos(parts[3]);
      sectionRaw = parts[4] || '';
    }

    en = en.trim().toLowerCase();
    ru = ru.trim().toLowerCase();
    tr = tr.trim();
    sectionRaw = sectionRaw.trim();
    const section = sectionRaw ? sanitizeSectionName(sectionRaw) : '';

    if (!en || !ru) { errors++; continue; }
    rows.push({ en, tr, ru, pos, section });
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

  const hasSectionColumn = unique.some(r => r.section);
  const defaultSectionId = document.getElementById('importSection').value;
  const defaultSection = state.sections.find(s => s.id === defaultSectionId);
  const defaultSectionName = defaultSection ? defaultSection.name : 'Без раздела';

  const existingLower = new Map(state.sections.map(s => [s.name.toLowerCase(), s.name]));

  const groups = new Map();
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
                  <span class="ip-en">${escapeHtml(r.en)}${r.pos ? ` <span class="ip-pos">${escapeHtml(POS_SHORT[r.pos] || r.pos)}</span>` : ''}</span>
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

  const sectionMap = new Map(state.sections.map(s => [s.name.toLowerCase(), s.id]));
  const createdSections = [];

  for (let i = 0; i < total; i++) {
    const r = rows[i];
    const raw = (r.section || '').trim();
    let sectionId;

    if (raw) {
      const key = raw.toLowerCase();
      if (!sectionMap.has(key)) {
        const newSection = { id: uid(), name: raw };
        state.sections.push(newSection);
        sectionMap.set(key, newSection.id);
        createdSections.push(newSection.name);
      }
      sectionId = sectionMap.get(key);
    } else {
      sectionId = defaultSectionId;
    }

    state.words.push({ id: uid(), sectionId, en: r.en, tr: r.tr, ru: r.ru, pos: r.pos || '' });

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

  markWordAdded(total);

  shuffledOrder = [];
  state.currentPage = 1;
  state.view = 'dictionary';
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
   [24] ЭКСПОРТ СЛОВ В CSV
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
    ? ['english', 'transcription', 'russian', 'pos', 'section']
    : ['english', 'transcription', 'russian', 'pos'];

  const lines = [headers.join(';')];
  const sectionMap = new Map(state.sections.map(s => [s.id, s.name]));

  for (const w of words) {
    const row = [esc(w.en), esc(w.tr || ''), esc(w.ru), esc(w.pos || '')];
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
   [25] ОБРАТНАЯ СВЯЗЬ
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
   [26] Поделиться
   ============================================================ */

const SHARE_URL = 'https://vetrovtimur.github.io/Wordbook/';
const SHARE_TEXT = 'Попробуй Wordbook — личный словарь английского!';

async function shareApp() {
  const fullText = SHARE_TEXT + '\n' + SHARE_URL;

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Wordbook',
        text: SHARE_TEXT,
        url: SHARE_URL,
      });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(SHARE_URL);
    showToast('🔗 Ссылка скопирована', 'info', 3000);
  } catch (e) {
    showToast(SHARE_URL, 'info', 6000);
  }
}

document.getElementById('menuShare').addEventListener('click', (e) => {
  e.stopPropagation();
  closeUserDropdown();
  shareApp();
});

/* ============================================================
   [27] ЧТО НОВОГО
   ============================================================ */

const UPDATES_VERSION = 5;
const UPDATES_KEY_PREFIX = 'wordbook_updates_seen_v2_';

const UPDATES = [
  /* ── Версия 5 (новые) ── */
  { type: 'feature', icon: 'mic',    title: 'Транскрипция — всегда',        text: 'Раньше у редких слов было «НЕТ ДАННЫХ». Теперь Wordbook сам генерирует произношение — оно будет у каждого слова.' },
  { type: 'feature', icon: 'tag',    title: 'AI-транскрипция с пометкой',   text: 'Рядом с такими транскрипциями стоит бейдж AI — она сгенерирована, а не взята из словаря. Если что-то не так — можно поправить руками.' },
  { type: 'fix',     icon: 'volume', title: 'Озвучка английского',          text: 'Починили воспроизведение английских слов — раньше они иногда молчали, если раскладка клавиатуры была переключена на русский.' },

   /* ── Версия 4 (новые) ── */
  { type: 'feature', icon: 'globe',  title: 'Пиши по-русски — получишь перевод',  text: 'Вводите слово по-русски — Wordbook сам подставит английский перевод, транскрипцию и часть речи. Первый запрос может занять 20–30 секунд, дальше — быстрее.' },
  { type: 'feature', icon: 'tag',    title: 'Часть речи — автоматически',         text: 'Wordbook определяет, существительное это, глагол или прилагательное — видно бейджем прямо в таблице. Можно поправить руками.' },
  { type: 'improve', icon: 'import', title: 'Импорт понимает 2/3/4/5 колонок',    text: 'Просто вставьте список из Excel — Wordbook сам разберётся, где слово, где перевод, где часть речи, а где раздел.' },
  { type: 'improve', icon: 'download', title: 'Экспорт теперь с частью речи',     text: 'CSV-файл содержит новую колонку «pos» — при повторном импорте часть речи сохранится.' },
  { type: 'fix',     icon: 'lock',   title: 'Вход без сюрпризов',                 text: 'Раньше снятая галочка «Запомнить меня» выкидывала из словаря. Теперь — просто сессия до закрытия вкладки. Удобно на чужих устройствах.' },

  /* ── Версия 3 ── */
  { type: 'feature', icon: 'key',    title: 'Заходите одним кликом',     text: 'Раньше Wordbook просил пароль каждый раз при заходе. Теперь — один раз вошли, и он помнит вас, пока вы сами не нажмёте «Выйти».' },
  { type: 'feature', icon: 'lock',   title: 'Чекбокс «Запомнить меня»',  text: 'Прямо на форме входа — новый переключатель. Хотите, чтобы Wordbook помнил вас — оставьте галку. Не хотите — снимите, и он не будет пускать без пароля.' },
  { type: 'feature', icon: 'star',   title: 'Поделиться с другом',       text: 'В меню появилась кнопка «Поделиться». Нажмите — и ссылка на Wordbook скопируется или откроется системное окно: WhatsApp, Telegram, куда угодно.' },
  { type: 'improve', icon: 'search', title: 'Показать пароль',           text: 'Забыли, что вводите? Нажмите на глазик справа от поля пароля — и увидите его. Нажмите ещё раз — снова скроется.' },
  { type: 'improve', icon: 'key',    title: 'Имя уже подставлено',       text: 'Wordbook запоминает, под кем вы заходили в прошлый раз, и сам подставляет имя в форму. Меньше печатать — быстрее войти.' },
  { type: 'feature', icon: 'download', title: 'Экспорт словаря в CSV',     text: 'Скачайте весь словарь или отдельный раздел — с колонкой «раздел».' },
  { type: 'feature', icon: 'target',   title: 'Цель дня',                  text: 'Ставьте цель по словам на день и следите за прогрессом. Дни, когда цель выполнена, отмечаются в календаре.' },
  { type: 'feature', icon: 'install',  title: 'Установка на телефон',      text: 'Wordbook теперь можно установить как приложение — иконка на главном экране.' },
  { type: 'feature', icon: 'key',      title: 'Смена пароля',              text: 'Меняйте пароль прямо из словаря — без перелогина и лишних шагов.' },
  { type: 'improve', icon: 'import',   title: 'Импорт с разделами',        text: 'Четвёртая колонка «раздел» в Excel — слова автоматически раскладываются по своим папкам.' },
  { type: 'feature', icon: 'chart',    title: 'Статистика занятий',        text: 'Серии заходов, лучший результат, дни с нами и пропуски — дневник ваших занятий.' },
  { type: 'feature', icon: 'import',   title: 'Импорт слов из Excel',      text: 'Вставьте список или загрузите файл .xlsx / .csv, до 100 слов за раз.' },
  { type: 'feature', icon: 'search',   title: 'Умный поиск',               text: 'Ищите по слову, переводу или транскрипции.' },
  { type: 'improve', icon: 'mic',      title: 'Автоматическая транскрипция', text: 'Вводите английское слово — произношение подставится само.' },
  { type: 'improve', icon: 'volume',   title: 'Озвучка слов',              text: 'Английский и русский в один клик, прямо из таблицы.' },
  { type: 'improve', icon: 'lock',     title: 'Безопасность аккаунтов',    text: 'SHA-256 хэш паролей, отдельный вход для администратора.' },
  { type: 'info',    icon: 'chat',     title: 'Обратная связь',            text: 'Прямая линия с администратором прямо из словаря.' },
  { type: 'info',    icon: 'moon',     title: 'Тёмная тема',               text: 'Комфортное чтение днём и ночью.' },
  { type: 'fix',     icon: 'mobile',   title: 'Фикс: разделы на мобильных', text: 'Больше не пропадают при переключении страниц.' },
  { type: 'fix',     icon: 'zap',      title: 'Скорость и стабильность',   text: 'Аккуратные сохранения, кэш запросов, мягкие уведомления.' },
  { type: 'fix',     icon: 'shield',   title: 'Защита данных',             text: 'Умные правила, разграничение прав доступа.' },
  { type: 'fix',     icon: 'star',     title: 'Чистый интерфейс',          text: 'Убрали лишнее, починили мелкие баги.' },
];

const UPDATE_ICONS = {
  chart:    '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  import:   '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  target:   '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  install:  '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  key:      '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  search:   '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  mic:      '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  volume:   '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  lock:     '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  chat:     '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  moon:     '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  mobile:   '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  zap:      '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  shield:   '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  star:     '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  globe:    '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  tag:      '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
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

/* ============================================================
   [28] ИНИЦИАЛИЗАЦИЯ И ПРЕЛОАДЕР
   ============================================================ */

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
      sections: [],
      words: [],
    };
    await fbSaveState(currentUserName, cloudState);
  }
  state = { ...defaultState, ...cloudState };
  if (!state.userName) state.userName = currentUserName;

    document.body.setAttribute('data-theme', state.theme);

  if ((state.dailyGoal || 0) > 0) {
    ensureTodayProgress();
  }
  markTodayVisited();

  // Тихий прогрев AI-воркера
  setTimeout(() => {
    fetch(TRANSLATE_WORKER_URL + '?mode=phonetic&word=hello').catch(() => {});
  }, 800);

  render();
  renderUserMenu();
  updateWhatsNewBadge();

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
   [29] СМЕНА ПАРОЛЯ
   ============================================================ */

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

[passwordCurrent, passwordNew, passwordConfirm].forEach(el => {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); changePassword(); }
  });
});

/* ============================================================
   [30] МОДАЛКА «ЦЕЛЬ ДНЯ»
   ============================================================ */

const goalModal = document.getElementById('goalModal');
const goalShow = document.getElementById('goalShow');
const goalCount = document.getElementById('goalCount');
const goalCountGroup = document.getElementById('goalCountGroup');

function openGoalModal() {
  const goal = state.dailyGoal || 0;
  goalShow.checked = goal > 0;
  goalCount.value = goal > 0 ? goal : 5;
  goalCountGroup.hidden = !goalShow.checked;

  const hint = document.getElementById('goalModalHint');
  if (hint) hint.hidden = !(goal > 0);

  goalModal.classList.add('show');
  if (goalShow.checked) {
    setTimeout(() => goalCount.focus(), 80);
  }
}

function closeGoalModal() {
  goalModal.classList.remove('show');
}

function saveGoal() {
  const enabled = goalShow.checked;
  let newGoal = enabled ? parseInt(goalCount.value, 10) : 0;

  if (enabled) {
    if (isNaN(newGoal) || newGoal < 1) newGoal = 1;
    if (newGoal > 100) newGoal = 100;
  } else {
    newGoal = 0;
  }

  const oldGoal = state.dailyGoal || 0;
  if (newGoal === oldGoal) { closeGoalModal(); return; }

  state.dailyGoal = newGoal;

  const today = getTodayISO();
  if (!state.dailyProgress) state.dailyProgress = {};

  if (newGoal === 0) {
    delete state.dailyProgress[today];
  } else if (oldGoal === 0) {
    const rec = state.dailyProgress[today];
    state.dailyProgress[today] = { added: rec ? rec.added : 0, goal: newGoal };
  }

  saveState();
  closeGoalModal();
  render();

  if (newGoal === 0) {
    showToast('Счётчик цели отключён', 'info', 3000);
  } else if (oldGoal === 0) {
    const w = plural(newGoal, 'слово', 'слова', 'слов');
    showToast(`Цель дня: ${newGoal} ${w}`, 'info', 3000);
  } else {
    const w = plural(newGoal, 'слово', 'слова', 'слов');
    showToast(`Цель изменена на ${newGoal} ${w} — начнёт действовать с завтрашнего дня`, 'info', 3500);
  }
}

document.getElementById('menuGoal').addEventListener('click', (e) => {
  e.stopPropagation();
  closeUserDropdown();
  openGoalModal();
});
document.getElementById('goalCard').addEventListener('click', openGoalModal);
document.getElementById('goalCancel').addEventListener('click', closeGoalModal);
document.getElementById('goalSave').addEventListener('click', saveGoal);
goalModal.addEventListener('click', (e) => {
  if (e.target === goalModal) closeGoalModal();
});
goalShow.addEventListener('change', () => {
  goalCountGroup.hidden = !goalShow.checked;
  if (goalShow.checked) setTimeout(() => goalCount.focus(), 50);
});
goalCount.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); saveGoal(); }
});


/* ============================================================
   [31] ТРЕНИРОВКА
   ============================================================ */

const training = {
  queue: [],
  current: null,
  originalTotal: 0,
  correct: 0,
  wrong: 0,
  retried: new Set(),
  startTime: 0,
  showing: false,
  direction: 'ru-en',
  settings: { sectionId: 'all', count: 5 }
};

function openTrainingModal() {
  // Сброс состояния
  training.queue = [];
  training.current = null;
  training.correct = 0;
  training.wrong = 0;
  training.retried = new Set();
  training.showing = false;

  // Заполнить разделы
  const sel = document.getElementById('trainSection');
  sel.innerHTML =
    `<option value="all">Все слова</option>` +
    state.sections.map(s =>
      `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`
    ).join('');

  // Восстановить прошлые настройки, если есть
  if (state.sections.some(s => s.id === training.settings.sectionId) || training.settings.sectionId === 'all') {
    sel.value = training.settings.sectionId;
  } else {
    sel.value = 'all';
  }
  document.querySelectorAll('input[name="trainDirection"]').forEach(r => {
    r.checked = (r.value === training.direction);
  });

  updateTrainSection();

  // Восстановить count, если влезает
  const slider = document.getElementById('trainCount');
  const desired = training.settings.count || 5;
  slider.value = Math.min(desired, parseInt(slider.max, 10) || 1);
  updateTrainCountLabel();

  document.getElementById('trainingOverlay').classList.add('show');
  showTrainScreen('setup');
}

function closeTrainingModal() {
  document.getElementById('trainingOverlay').classList.remove('show');
  document.getElementById('trainCard').classList.remove('flipped');
}

function showTrainScreen(name) {
  document.getElementById('trainScreenSetup').hidden = (name !== 'setup');
  document.getElementById('trainScreenCard').hidden = (name !== 'card');
  document.getElementById('trainScreenResult').hidden = (name !== 'result');
}

function updateTrainSection() {
  const sel = document.getElementById('trainSection');
  const sectionId = sel.value;
  const total = sectionId === 'all'
    ? state.words.length
    : state.words.filter(w => w.sectionId === sectionId).length;

  const slider = document.getElementById('trainCount');
  const max = Math.max(1, total);
  slider.max = max;

  let val = parseInt(slider.value, 10) || 5;
  if (val > max) val = max;
  if (val < 1) val = 1;
  slider.value = val;

  const warn = document.getElementById('trainSetupWarning');
  const startBtn = document.getElementById('trainStartBtn');

  if (total === 0) {
    slider.disabled = true;
    startBtn.disabled = true;
    warn.hidden = false;
  } else {
    slider.disabled = false;
    startBtn.disabled = false;
    warn.hidden = true;
  }

  updateTrainCountLabel(total);
}

function updateTrainCountLabel(total) {
  if (typeof total !== 'number') {
    const sel = document.getElementById('trainSection');
    const sid = sel.value;
    total = sid === 'all'
      ? state.words.length
      : state.words.filter(w => w.sectionId === sid).length;
  }
  const slider = document.getElementById('trainCount');
  document.getElementById('trainCountVal').textContent = slider.value;
  document.getElementById('trainCountHint').textContent =
    `из ${total} ${plural(total, 'слова', 'слов', 'слов')} в разделе`;
}

function startTraining() {
  const sectionId = document.getElementById('trainSection').value;
  const direction = document.querySelector('input[name="trainDirection"]:checked').value;
  const count = parseInt(document.getElementById('trainCount').value, 10) || 5;

  training.settings = { sectionId, count };
  training.direction = direction;

  let pool = state.words;
  if (sectionId !== 'all') pool = pool.filter(w => w.sectionId === sectionId);
  if (!pool.length) return;

  const shuffled = shuffleArray(pool).slice(0, count);

  training.queue = shuffled.map(w => ({
    word: w,
    direction: direction === 'mix'
      ? (Math.random() < 0.5 ? 'ru-en' : 'en-ru')
      : direction
  }));

  training.originalTotal = training.queue.length;
  training.correct = 0;
  training.wrong = 0;
  training.retried = new Set();
  training.startTime = Date.now();
  training.showing = false;

  showTrainScreen('card');
  nextTrainCard();
}

function nextTrainCard() {
  if (!training.queue.length) {
    showTrainResult();
    return;
  }
  training.current = training.queue.shift();
  renderTrainCard();
  updateTrainProgress();
}

function renderTrainCard() {
  const item = training.current;
  if (!item) return;
  const w = item.word;
  const front = item.direction === 'ru-en' ? w.ru : w.en;
  const back = item.direction === 'ru-en' ? w.en : w.ru;

  document.getElementById('trainWordFront').textContent = front;
  document.getElementById('trainWordBack').textContent = back;

  const trWrap = document.getElementById('trainBackInfo');
  const trEl = document.getElementById('trainTr');
  const aiEl = document.getElementById('trainTrAI');

  if (w.tr) {
    trEl.textContent = w.tr;
    aiEl.hidden = !w.trAI;
    trWrap.hidden = false;
  } else {
    trWrap.hidden = true;
  }

  const posEl = document.getElementById('trainPos');
  if (w.pos && POS_SHORT[w.pos]) {
    posEl.textContent = POS_SHORT[w.pos];
    posEl.hidden = false;
  } else {
    posEl.hidden = true;
  }

  document.getElementById('trainCard').classList.remove('flipped');
  document.getElementById('trainActions').hidden = true;
  training.showing = false;
}

function flipTrainCard() {
  if (training.showing) return;
  if (!training.current) return;
  training.showing = true;
  document.getElementById('trainCard').classList.add('flipped');
  document.getElementById('trainActions').hidden = false;
}

function updateTrainProgress() {
  const total = training.originalTotal || 1;
  const pct = Math.min(100, Math.round((training.correct / total) * 100));
  document.getElementById('trainProgressText').textContent =
    `${training.correct} / ${training.originalTotal}`;
  document.getElementById('trainProgressFill').style.width = pct + '%';
}

function trainAnswer(known) {
  if (!training.current) return;
  if (!training.showing) return;

  const item = training.current;
  const wordId = item.word.id;

  if (known) {
    training.correct++;
  } else {
    training.wrong++;
    if (!training.retried.has(wordId)) {
      // Первый раз "не знаю" — слово в конец очереди
      training.retried.add(wordId);
      training.queue.push(item);
    }
    // Второй раз — просто пропускаем
  }

  training.current = null;
  nextTrainCard();
}

function showTrainResult() {
  const total = training.originalTotal || 1;
  const pct = Math.round((training.correct / total) * 100);

  document.getElementById('trainResultBig').textContent =
    `${training.correct} / ${training.originalTotal}`;
  document.getElementById('trainResultPercent').textContent = pct + '%';

  const elapsed = Math.round((Date.now() - training.startTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = mins > 0
    ? `${mins} ${plural(mins, 'минута', 'минуты', 'минут')} ${secs} ${plural(secs, 'секунда', 'секунды', 'секунд')}`
    : `${secs} ${plural(secs, 'секунда', 'секунды', 'секунд')}`;
  document.getElementById('trainResultTime').textContent = 'Время: ' + timeStr;

  showTrainScreen('result');
}

/* ---------- Обработчики тренировки ---------- */

document.getElementById('menuTraining').addEventListener('click', (e) => {
  e.stopPropagation();
  closeUserDropdown();
  openTrainingModal();
});

document.getElementById('trainSetupClose').addEventListener('click', closeTrainingModal);
document.getElementById('trainSetupCancel').addEventListener('click', closeTrainingModal);

document.getElementById('trainSection').addEventListener('change', () => {
  const sel = document.getElementById('trainSection');
  training.settings.sectionId = sel.value;
  updateTrainSection();
});

document.getElementById('trainCount').addEventListener('input', () => {
  updateTrainCountLabel();
});

document.getElementById('trainStartBtn').addEventListener('click', startTraining);

document.getElementById('trainCard').addEventListener('click', () => {
  flipTrainCard();
});

document.getElementById('trainSpeak').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!training.current) return;
  const w = training.current.word;
  if (w.en) speak(w.en, 'en', e.currentTarget);
});

document.getElementById('trainWrong').addEventListener('click', (e) => {
  e.stopPropagation();
  trainAnswer(false);
});

document.getElementById('trainRight').addEventListener('click', (e) => {
  e.stopPropagation();
  trainAnswer(true);
});

document.getElementById('trainExit').addEventListener('click', async () => {
  if (training.correct + training.wrong > 0) {
    const ok = await showConfirm(
      'Прервать тренировку? Прогресс не сохранится.',
      'Прервать?', 'Прервать'
    );
    if (!ok) return;
  }
  closeTrainingModal();
});

document.getElementById('trainResultAgain').addEventListener('click', () => {
  startTraining();
});

document.getElementById('trainResultChange').addEventListener('click', () => {
  showTrainScreen('setup');
});

document.getElementById('trainResultClose').addEventListener('click', () => {
  closeTrainingModal();
});

/* ---------- Клавиатура ---------- */

document.addEventListener('keydown', (e) => {
  const overlay = document.getElementById('trainingOverlay');
  if (!overlay || !overlay.classList.contains('show')) return;

  const cardScreen = document.getElementById('trainScreenCard');
  const isCardScreen = cardScreen && !cardScreen.hidden;

  if (e.key === 'Escape') {
    e.preventDefault();
    document.getElementById('trainExit').click();
    return;
  }

  if (!isCardScreen) return;

  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    if (!training.showing) flipTrainCard();
    return;
  }

  if (training.showing) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      trainAnswer(false);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      trainAnswer(true);
    }
  }
});