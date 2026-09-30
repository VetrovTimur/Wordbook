/* ============================================================
   THEME
   ============================================================ */
function applyTheme() {
  document.body.setAttribute('data-theme', state.theme);
  const label = document.getElementById('themeLabel');
  if (label) {
    label.textContent = state.theme === 'light' ? 'Тёмная тема' : 'Светлая тема';
  }
  const authBtn = document.getElementById('authThemeToggle');
  if (authBtn) {
    authBtn.title = state.theme === 'light' ? 'Тёмная тема' : 'Светлая тема';
  }
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  saveState();
  applyTheme();
}

/* ============================================================
   AUTH
   ============================================================ */
const AUTH_KEY = 'wordbook_auth_v1';
const TEST_USER = { name: 'test', pass: 'test', blocked: true };

let auth = { users: [], current: null };
let authMode = 'login';

function loadAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      auth.users = Array.isArray(parsed.users) ? parsed.users : [];
      auth.current = typeof parsed.current === 'string' ? parsed.current : null;
    }
  } catch (e) {}
}

function saveAuth() {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)); } catch (e) {}
}

function simpleHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

/* Создаём тестового пользователя test/test (заблокирован), если его нет */
function ensureTestUser() {
  const exists = auth.users.some(u => u.name.toLowerCase() === TEST_USER.name);
  if (exists) {
    // На случай, если он уже был, но без blocked — выставим
    const u = auth.users.find(x => x.name.toLowerCase() === TEST_USER.name);
    if (!u.blocked) { u.blocked = true; saveAuth(); }
    return;
  }
  auth.users.push({
    name: TEST_USER.name,
    passHash: simpleHash(TEST_USER.pass),
    blocked: true,
    role: 'user',
    createdAt: Date.now(),
  });
  saveAuth();
}

function showAuthScreen() {
  document.body.classList.remove('authed');
  resetAuthForm();
  setAuthMode('login');
  setTimeout(() => {
    const n = document.getElementById('authName');
    if (n) n.focus();
  }, 80);
}

function showApp() {
  document.body.classList.add('authed');

  const name = auth.current || 'Гость';
  document.getElementById('userName').textContent = name;
  document.getElementById('userInitial').textContent = (name.trim()[0] || 'W').toUpperCase();

  markTodayVisited();
  render();
  applyTheme();
}

function resetAuthForm() {
  ['authName','authPass','authConfirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  clearAuthErrors();
}

function clearAuthErrors() {
  ['authNameErr','authPassErr','authConfirmErr'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
  ['authName','authPass','authConfirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('error');
  });
  const banner = document.getElementById('authBlockedBanner');
  if (banner) banner.classList.remove('show');
}

function setAuthMode(mode) {
  authMode = mode;
  const heading = document.getElementById('authHeading');
  const submit = document.getElementById('authSubmit');
  const switchText = document.getElementById('authSwitchText');
  const switchBtn = document.getElementById('authSwitch');
  const confirmField = document.getElementById('authConfirmField');

  if (mode === 'login') {
    heading.textContent = 'Вход в словарь';
    submit.textContent = 'Войти';
    switchText.textContent = 'Нет записи?';
    switchBtn.textContent = 'Создать';
    confirmField.hidden = true;
  } else {
    heading.textContent = 'Новая запись';
    submit.textContent = 'Создать';
    switchText.textContent = 'Уже есть запись?';
    switchBtn.textContent = 'Войти';
    confirmField.hidden = false;
  }
  clearAuthErrors();
  document.getElementById('authConfirm').value = '';
}

function authSubmitHandler(e) {
  e.preventDefault();
  clearAuthErrors();

  const name = document.getElementById('authName').value.trim();
  const pass = document.getElementById('authPass').value;
  const confirm = document.getElementById('authConfirm').value;

  let hasError = false;

  if (!name) {
    document.getElementById('authNameErr').textContent = 'Введите имя';
    document.getElementById('authName').classList.add('error');
    hasError = true;
  }
  if (!pass) {
    document.getElementById('authPassErr').textContent = 'Введите пароль';
    document.getElementById('authPass').classList.add('error');
    hasError = true;
  }
  if (authMode === 'register' && pass && confirm !== pass) {
    document.getElementById('authConfirmErr').textContent = 'Пароли не совпадают';
    document.getElementById('authConfirm').classList.add('error');
    hasError = true;
  }
  if (hasError) return;

  if (authMode === 'register') {
    if (auth.users.some(u => u.name.toLowerCase() === name.toLowerCase())) {
      document.getElementById('authNameErr').textContent = 'Такое имя уже занято';
      document.getElementById('authName').classList.add('error');
      return;
    }
    auth.users.push({
      name,
      passHash: simpleHash(pass),
      blocked: false,
      role: 'user',
      createdAt: Date.now(),
    });
    auth.current = name;
    saveAuth();
    showApp();
  } else {
    const user = auth.users.find(u => u.name.toLowerCase() === name.toLowerCase());

    // Неверные данные — общая ошибка
    if (!user || user.passHash !== simpleHash(pass)) {
      document.getElementById('authPassErr').textContent = 'Неверное имя или пароль';
      document.getElementById('authName').classList.add('error');
      document.getElementById('authPass').classList.add('error');
      return;
    }

    // Пользователь заблокирован — показываем баннер
    if (user.blocked) {
      const banner = document.getElementById('authBlockedBanner');
      const bannerText = document.getElementById('authBlockedText');
      bannerText.textContent = `Пользователь «${user.name}» заблокирован администратором. Обратитесь за помощью для восстановления доступа.`;
      banner.classList.add('show');
      document.getElementById('authName').classList.add('error');
      document.getElementById('authPass').classList.add('error');
      document.getElementById('authPassErr').textContent = 'Доступ запрещён';
      return;
    }

    auth.current = user.name;
    saveAuth();
    showApp();
  }
}

function logoutHandler() {
  auth.current = null;
  saveAuth();
  showAuthScreen();
}

/* ============================================================
   STATE
   ============================================================ */
const STORAGE_KEY = 'wordbook_state_v12';
const PAGE_SIZE = 15;
const CAL_DAYS_BEFORE = 10;
const CAL_DAYS_AFTER = 10;

const defaultState = {
  theme: 'light',
  activeSectionId: 'all',
  shuffle: false,
  currentPage: 1,
  visits: [],
  calendarSeeded: false,
  sections: [
    { id: 's1', name: 'Основное' },
    { id: 's2', name: 'Путешествия' },
    { id: 's3', name: 'Еда' },
  ],
  words: [
    { id: 'w1',  sectionId: 's1', en: 'hello',      tr: '/həˈloʊ/',      ru: 'привет' },
    { id: 'w2',  sectionId: 's1', en: 'world',      tr: '/wɜːrld/',      ru: 'мир' },
    { id: 'w3',  sectionId: 's1', en: 'knowledge',  tr: '/ˈnɒlɪdʒ/',     ru: 'знание' },
    { id: 'w4',  sectionId: 's1', en: 'beautiful',  tr: '/ˈbjuːtɪfl/',   ru: 'красивый' },
    { id: 'w5',  sectionId: 's1', en: 'memory',     tr: '/ˈmeməri/',     ru: 'воспоминание' },
    { id: 'w6',  sectionId: 's1', en: 'promise',    tr: '/ˈprɒmɪs/',     ru: 'обещание' },
    { id: 'w7',  sectionId: 's1', en: 'freedom',    tr: '/ˈfriːdəm/',    ru: 'свобода' },
    { id: 'w8',  sectionId: 's1', en: 'patience',   tr: '/ˈpeɪʃns/',     ru: 'терпение' },
    { id: 'w9',  sectionId: 's1', en: 'water',      tr: '/ˈwɔːtər/',     ru: 'вода' },
    { id: 'w10', sectionId: 's2', en: 'airport',    tr: '/ˈeəpɔːrt/',    ru: 'аэропорт' },
    { id: 'w11', sectionId: 's2', en: 'luggage',    tr: '/ˈlʌɡɪdʒ/',     ru: 'багаж' },
    { id: 'w12', sectionId: 's2', en: 'ticket',     tr: '/ˈtɪkɪt/',      ru: 'билет' },
    { id: 'w13', sectionId: 's2', en: 'airplane',   tr: '/ˈeəpleɪn/',    ru: 'самолёт' },
    { id: 'w14', sectionId: 's2', en: 'journey',    tr: '/ˈdʒɜːrni/',    ru: 'путешествие' },
    { id: 'w15', sectionId: 's2', en: 'hotel',      tr: '/hoʊˈtel/',     ru: 'отель' },
    { id: 'w16', sectionId: 's2', en: 'passport',   tr: '/ˈpæspɔːrt/',   ru: 'паспорт' },
    { id: 'w17', sectionId: 's2', en: 'customs',    tr: '/ˈkʌstəmz/',    ru: 'таможня' },
    { id: 'w18', sectionId: 's2', en: 'destination',tr: '/ˌdestɪˈneɪʃn/',ru: 'место назначения' },
    { id: 'w19', sectionId: 's2', en: 'mountain',   tr: '/ˈmaʊntn/',     ru: 'гора' },
    { id: 'w20', sectionId: 's2', en: 'river',      tr: '/ˈrɪvər/',      ru: 'река' },
    { id: 'w21', sectionId: 's2', en: 'forest',     tr: '/ˈfɔːrɪst/',    ru: 'лес' },
    { id: 'w22', sectionId: 's2', en: 'sunset',     tr: '/ˈsʌnset/',     ru: 'закат' },
    { id: 'w23', sectionId: 's2', en: 'sunrise',    tr: '/ˈsʌnraɪz/',    ru: 'рассвет' },
    { id: 'w24', sectionId: 's2', en: 'adventure',  tr: '/ədˈventʃər/',  ru: 'приключение' },
    { id: 'w25', sectionId: 's3', en: 'breakfast',  tr: '/ˈbrekfəst/',   ru: 'завтрак' },
    { id: 'w26', sectionId: 's3', en: 'delicious',  tr: '/dɪˈlɪʃəs/',    ru: 'вкусный' },
    { id: 'w27', sectionId: 's3', en: 'restaurant', tr: '/ˈrestərɑːnt/', ru: 'ресторан' },
    { id: 'w28', sectionId: 's3', en: 'menu',       tr: '/ˈmenjuː/',     ru: 'меню' },
    { id: 'w29', sectionId: 's3', en: 'dinner',     tr: '/ˈdɪnər/',      ru: 'ужин' },
    { id: 'w30', sectionId: 's3', en: 'lunch',      tr: '/lʌntʃ/',       ru: 'обед' },
    { id: 'w31', sectionId: 's3', en: 'appetizer',  tr: '/ˈæpɪtaɪzər/',  ru: 'закуска' },
    { id: 'w32', sectionId: 's3', en: 'dessert',    tr: '/dɪˈzɜːrt/',    ru: 'десерт' },
    { id: 'w33', sectionId: 's3', en: 'recipe',     tr: '/ˈresəpi/',     ru: 'рецепт' },
    { id: 'w34', sectionId: 's3', en: 'kitchen',    tr: '/ˈkɪtʃɪn/',     ru: 'кухня' },
    { id: 'w35', sectionId: 's3', en: 'grocery',    tr: '/ˈɡroʊsəri/',   ru: 'продукты' },
  ],
};

let state = loadState();
let shuffledOrder = [];
let currentSearch = '';
let editingWordId = null;
let lastAddedWordId = null;
let highlightTimer = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState, ...JSON.parse(raw) };
  } catch (e) {}
  return JSON.parse(JSON.stringify(defaultState));
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function markTodayVisited() {
  if (!Array.isArray(state.visits)) state.visits = [];
  const todayISO = toISO(new Date());

  if (!state.calendarSeeded) {
    state.calendarSeeded = true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 1; i <= 10; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (Math.random() < 0.6) {
        const iso = toISO(d);
        if (!state.visits.includes(iso)) state.visits.push(iso);
      }
    }
  }

  if (!state.visits.includes(todayISO)) state.visits.push(todayISO);
  saveState();
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
    utt.onend = stop;
    utt.onerror = stop;
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

function renderCalendar() {
  const el = document.getElementById('calendar');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = toISO(today);

  const RU_DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  const days = [];
  for (let i = -CAL_DAYS_BEFORE; i <= CAL_DAYS_AFTER; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days.push(d);
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
  applyTheme();

  renderCalendar();
  renderAllWordsBlock();
  renderSections();
  renderAddSection();
  renderWords();
  renderPagination();
  renderSectionSelect();

  const addBtn = document.getElementById('addWordBtn');
  if (!state.sections.length) {
    addBtn.disabled = true;
    addBtn.title = 'Сначала создайте раздел';
  } else {
    addBtn.disabled = false;
    addBtn.title = '';
  }

  const shuffleBtn = document.getElementById('shuffleBtn');
  const shuffleLabel = document.getElementById('shuffleLabel');
  if (state.shuffle) {
    shuffleBtn.classList.add('active');
    shuffleBtn.title = 'Перемешать ещё раз';
    shuffleLabel.textContent = 'Вперемешку';
  } else {
    shuffleBtn.classList.remove('active');
    shuffleBtn.title = 'Перемешать слова';
    shuffleLabel.textContent = 'Перемешать';
  }
}

function renderAllWordsBlock() {
  const total = state.words.length;
  const isActive = state.activeSectionId === 'all';
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
    const isActive = state.activeSectionId === s.id;
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
        if (inp) {
          inp.focus();
          inp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
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
        inp.value = '';
        inp.placeholder = 'Уже существует';
        inp.focus();
        return;
      }
      state.sections.push({ id: uid(), name });
      isAddingSection = false;
      saveState();
      render();
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
        <p>${currentSearch
          ? 'Попробуйте изменить запрос.'
          : hasSections ? 'Нажмите «Добавить слово», чтобы начать свой словарь.' : 'Сначала создайте раздел в панели слева.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = pageWords.map(w => {
    const cls = w.id === lastAddedWordId ? 'word-row highlight' : 'word-row';
    const trCell = w.tr
      ? `<span class="word-tr">${escapeHtml(w.tr)}</span>`
      : `<span class="word-tr empty">нет данных</span>`;
    return `
    <div class="${cls}" data-word-id="${escapeHtml(w.id)}">
      <div class="word-cell">
        <button class="speak-btn" type="button" data-speak="en" data-word-id="${escapeHtml(w.id)}" title="Прослушать">
          ${speakerSvg()}
        </button>
        <span class="word-en">${escapeHtml(w.en)}</span>
      </div>
      <div class="word-cell">${trCell}</div>
      <div class="word-cell">
        <button class="speak-btn" type="button" data-speak="ru" data-word-id="${escapeHtml(w.id)}" title="Прослушать">
          ${speakerSvg()}
        </button>
        <span class="word-ru">${escapeHtml(w.ru)}</span>
      </div>
      <div class="row-actions">
        <button class="action-btn" type="button" data-edit-word="${escapeHtml(w.id)}" title="Редактировать">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
          </svg>
        </button>
        <button class="action-btn danger" type="button" data-delete-word="${escapeHtml(w.id)}" title="Удалить">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  }).join('');

  if (lastAddedWordId) {
    const el = container.querySelector(`[data-word-id="${lastAddedWordId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function renderPagination() {
  const el = document.getElementById('pagination');
  const { total, totalPages, start, end } = getPageSlice();

  if (totalPages <= 1) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }

  el.hidden = false;

  const cur = state.currentPage;
  const nums = getPageNumbers(cur, totalPages);

  const info = `<span class="page-info">Показано <b>${start + 1}–${Math.min(end, total)}</b> из <b>${total}</b></span>`;

  const prevBtn = `
    <button class="page-btn nav" type="button" data-page="prev" ${cur === 1 ? 'disabled' : ''} title="Назад">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>`;

  const nextBtn = `
    <button class="page-btn nav" type="button" data-page="next" ${cur === totalPages ? 'disabled' : ''} title="Вперёд">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>`;

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
  saveState();
  renderWords();
  renderPagination();
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
    <path d="M11 5 6 9H2v6h4l5 4V5z"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>`;
}

function renderSectionSelect() {
  const sel = document.getElementById('inSection');
  const prev = sel.value;
  sel.innerHTML = state.sections.map(s =>
    `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`
  ).join('');
  if (state.sections.some(s => s.id === prev)) sel.value = prev;
  else if (state.sections.some(s => s.id === state.activeSectionId)) sel.value = state.activeSectionId;
  else if (state.sections.length) sel.value = state.sections[0].id;
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
    shuffledOrder = [];
    state.currentPage = 1;
    saveState(); render();
    return;
  }
  const item = e.target.closest('[data-section-id]');
  if (item) {
    const id = item.getAttribute('data-section-id');
    if (state.activeSectionId === id) return;
    state.activeSectionId = id;
    shuffledOrder = [];
    state.currentPage = 1;
    saveState(); render();
  }
});

document.getElementById('themeToggle').addEventListener('click', toggleTheme);
document.getElementById('authThemeToggle').addEventListener('click', toggleTheme);

document.getElementById('searchInput').addEventListener('input', (e) => {
  currentSearch = e.target.value;
  state.currentPage = 1;
  renderWords();
  renderPagination();
});
document.getElementById('searchClear').addEventListener('click', () => {
  currentSearch = '';
  document.getElementById('searchInput').value = '';
  state.currentPage = 1;
  renderWords();
  renderPagination();
});
document.getElementById('shuffleBtn').addEventListener('click', (e) => {
  if (e.target.closest('#shuffleOff')) {
    e.stopPropagation();
    state.shuffle = false;
    shuffledOrder = [];
    state.currentPage = 1;
    saveState(); render();
    return;
  }
  state.shuffle = true;
  shuffledOrder = [];
  state.currentPage = 1;
  saveState(); render();
});

document.getElementById('wordList').addEventListener('click', async (e) => {
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
  if (editBtn) {
    e.preventDefault();
    openEditWordModal(editBtn.getAttribute('data-edit-word'));
  }
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
  inEn.classList.remove('error');
  inRu.classList.remove('error');
  errEn.textContent = '';
  errRu.textContent = '';
}
function openAddWordModal() {
  if (!state.sections.length) return;
  editingWordId = null;
  modalTitle.textContent = 'Новое слово';
  saveWordBtn.textContent = 'Добавить';
  inEn.value = ''; inTr.value = ''; inRu.value = '';
  resetErrors();
  renderSectionSelect();
  wordModal.classList.add('show');
  setTimeout(() => inEn.focus(), 60);
}
function openEditWordModal(wordId) {
  const w = state.words.find(x => x.id === wordId);
  if (!w) return;
  editingWordId = wordId;
  modalTitle.textContent = 'Редактировать';
  saveWordBtn.textContent = 'Сохранить';
  inEn.value = w.en;
  inTr.value = w.tr || '';
  inRu.value = w.ru;
  resetErrors();
  renderSectionSelect();
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
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && wordModal.classList.contains('show')) closeWordModal();
});

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
  if (hasError) {
    (inEn.classList.contains('error') ? inEn : inRu).focus();
    return;
  }

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
  if (idx >= 0) {
    state.currentPage = Math.floor(idx / PAGE_SIZE) + 1;
    saveState();
  }

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
   INIT
   ============================================================ */
function init() {
  loadAuth();

  // Создаём тестового пользователя test/test (заблокирован)
  ensureTestUser();

  // Применяем тему СРАЗУ — до показа auth или app
  applyTheme();

  document.getElementById('authForm').addEventListener('submit', authSubmitHandler);
  document.getElementById('authSwitch').addEventListener('click', () => {
    setAuthMode(authMode === 'login' ? 'register' : 'login');
  });
  document.getElementById('logoutBtn').addEventListener('click', logoutHandler);

  // Скрываем баннер при вводе в поля
  ['authName', 'authPass'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      document.getElementById('authBlockedBanner').classList.remove('show');
    });
  });

  ['authName','authPass','authConfirm'].forEach((id, idx, arr) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const nextId = arr[idx + 1];
        if (nextId) {
          const nextEl = document.getElementById(nextId);
          if (nextEl && !nextEl.closest('.auth-field').hidden) {
            nextEl.focus();
            return;
          }
        }
        authSubmitHandler(new Event('submit'));
      }
    });
  });

  if (auth.current && auth.users.some(u => u.name === auth.current && !u.blocked)) {
    showApp();
  } else {
    showAuthScreen();
  }
}

init();
