/* ============================================================
   THEME
   ============================================================ */
const AUTH_THEME_KEY = 'wordbook_auth_theme';

function loadTheme() {
  try { return localStorage.getItem(AUTH_THEME_KEY) || 'light'; } catch (e) { return 'light'; }
}
function saveTheme(t) {
  try { localStorage.setItem(AUTH_THEME_KEY, t); } catch (e) {}
}

let theme = loadTheme();

function applyTheme() {
  document.body.setAttribute('data-theme', theme);
  const authBtn = document.getElementById('authThemeToggle');
  if (authBtn) {
    authBtn.title = theme === 'light' ? 'Тёмная тема' : 'Светлая тема';
  }
}

function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  saveTheme(theme);
  applyTheme();
}

/* ============================================================
   CURRENT USER (кто залогинен) — только имя в localStorage
   ============================================================ */
const CURRENT_USER_KEY = 'wordbook_current_user';

function getCurrentUser() {
  try { return localStorage.getItem(CURRENT_USER_KEY); } catch (e) { return null; }
}
function setCurrentUser(name) {
  try { localStorage.setItem(CURRENT_USER_KEY, name); } catch (e) {}
}
function clearCurrentUser() {
  try { localStorage.removeItem(CURRENT_USER_KEY); } catch (e) {}
}

/* ============================================================
   UI helpers
   ============================================================ */
let authMode = 'login';

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

/* ============================================================
   Обработка submit
   ============================================================ */
async function authSubmitHandler(e) {
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

  const submitBtn = document.getElementById('authSubmit');
  submitBtn.disabled = true;
  const origText = submitBtn.textContent;
  submitBtn.textContent = authMode === 'register' ? 'Создаю...' : 'Проверяю...';

  try {
    if (authMode === 'register') {
      await handleRegister(name, pass);
    } else {
      await handleLogin(name, pass);
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = origText;
  }
}

async function handleRegister(name, pass) {
  // Не занято ли имя
  const existing = await fbGetUser(name);
  if (existing) {
    document.getElementById('authNameErr').textContent = 'Такое имя уже занято';
    document.getElementById('authName').classList.add('error');
    return;
  }

  const passHash = fbSimpleHash(pass);
  const ok = await fbCreateUser(name, passHash, 'user');
  if (!ok) {
    document.getElementById('authNameErr').textContent = 'Не удалось создать аккаунт. Попробуйте позже.';
    return;
  }

  // Создаём пустой state для нового пользователя
  await fbSaveState(name, {
    theme: 'light',
    activeSectionId: 'all',
    shuffle: false,
    currentPage: 1,
    visits: [],
    calendarSeeded: false,
    sections: [],
    words: [],
  });

  setCurrentUser(name);
  redirectByRole('user');
}

async function handleLogin(name, pass) {
  const user = await fbGetUser(name);
  const passHash = fbSimpleHash(pass);

  if (!user || user.passHash !== passHash) {
    document.getElementById('authPassErr').textContent = 'Неверное имя или пароль';
    document.getElementById('authName').classList.add('error');
    document.getElementById('authPass').classList.add('error');
    return;
  }

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

  setCurrentUser(user.name);
  redirectByRole(user.role);
}

function redirectByRole(role) {
  if (role === 'admin') {
    window.location.href = 'adminPage/adminPage.html';
  } else {
    window.location.href = 'dictionary/dictionary.html';
  }
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  applyTheme();

  // Уже залогинен? Проверим и редиректнём
  const currentName = getCurrentUser();
  if (currentName) {
    const user = await fbGetUser(currentName);
    if (user && !user.blocked) {
      redirectByRole(user.role);
      return;
    } else {
      clearCurrentUser();
    }
  }

  document.getElementById('authForm').addEventListener('submit', authSubmitHandler);
  document.getElementById('authSwitch').addEventListener('click', () => {
    setAuthMode(authMode === 'login' ? 'register' : 'login');
  });
  document.getElementById('authThemeToggle').addEventListener('click', toggleTheme);

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

  setAuthMode('login');
  setTimeout(() => {
    const n = document.getElementById('authName');
    if (n) n.focus();
  }, 80);
}

init();