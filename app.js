
/* Последнее имя пользователя (не удаляется при выходе) */
const LAST_USER_KEY = 'wordbook_last_user';

/* Запомнить меня */
const REMEMBER_ME_KEY = 'wordbook_remember_me';

function getRememberMe() {
  try {
    const v = localStorage.getItem(REMEMBER_ME_KEY);
    return v === null ? true : v === '1';
  } catch (e) { return true; }
}
function setRememberMe(val) {
  try { localStorage.setItem(REMEMBER_ME_KEY, val ? '1' : '0'); } catch (e) {}
}

function getLastUser() {
  try { return localStorage.getItem(LAST_USER_KEY) || ''; } catch (e) { return ''; }
}
function setLastUser(name) {
  if (!name) return;
  try { localStorage.setItem(LAST_USER_KEY, name); } catch (e) {}
}

function resetPasswordEyes() {
  document.querySelectorAll('.auth-eye').forEach(btn => {
    btn.classList.remove('showing');
    const id = btn.getAttribute('data-eye-target');
    const input = document.getElementById(id);
    if (input) input.type = 'password';
  });
}

/* Тема */
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
  if (authBtn) authBtn.title = theme === 'light' ? 'Тёмная тема' : 'Светлая тема';
}

function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  saveTheme(theme);
  applyTheme();
}

function getCurrentUser() {
  try { return localStorage.getItem(CURRENT_USER_KEY); } catch (e) { return null; }
}
function setCurrentUser(name) {
  try { localStorage.setItem(CURRENT_USER_KEY, name); } catch (e) {}
}
function clearCurrentUser() {
  try { localStorage.removeItem(CURRENT_USER_KEY); } catch (e) {}
}

/* UI-состояние */
let authMode = 'login';
let authRole = 'user';

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
  const passHint = document.getElementById('authPassHint');

  if (mode === 'login') {
    heading.textContent = 'Вход в словарь';
    submit.textContent = 'Войти';
    switchText.textContent = 'Нет записи?';
    switchBtn.textContent = 'Создать';
    confirmField.hidden = true;
    if (passHint) passHint.hidden = true;
  } else {
    heading.textContent = 'Новая запись';
    submit.textContent = 'Создать';
    switchText.textContent = 'Уже есть запись?';
    switchBtn.textContent = 'Войти';
    confirmField.hidden = false;
    if (passHint) passHint.hidden = false;
  }
    clearAuthErrors();
  document.getElementById('authConfirm').value = '';

  resetPasswordEyes();

  const remWrap1 = document.getElementById('authRememberWrap');
  if (remWrap1) remWrap1.hidden = (authRole === 'admin' || mode === 'register');
}

function setAuthRole(role) {
  authRole = role;
  const heading = document.getElementById('authHeading');
  const submit = document.getElementById('authSubmit');
  const userWrap = document.getElementById('authUserSwitchWrap');
  const adminWrap = document.getElementById('authAdminSwitchWrap');
  const adminBtn = document.getElementById('authAdminSwitch');
  const nameLabel = document.getElementById('authNameLabel');
  const nameInput = document.getElementById('authName');
  const confirmField = document.getElementById('authConfirmField');

  if (role === 'admin') {
    heading.textContent = 'Вход для администратора';
    submit.textContent = 'Войти';
    userWrap.style.display = 'none';
    adminWrap.style.display = '';
    adminBtn.textContent = 'Обычный вход';
    nameLabel.textContent = 'Email';
    nameInput.type = 'email';
    nameInput.placeholder = 'admin@wordbook.local';
    nameInput.value = '';
    document.getElementById('authPass').value = '';
    confirmField.hidden = true;
    clearAuthErrors();
  } else {
    userWrap.style.display = '';
    adminWrap.style.display = '';
    adminBtn.textContent = 'Вход для администратора';
    nameLabel.textContent = 'Имя';
    nameInput.type = 'text';
    nameInput.placeholder = '';
    nameInput.value = getLastUser();
    document.getElementById('authPass').value = '';
    clearAuthErrors();
    setAuthMode(authMode);
  }

   resetPasswordEyes();

  const remWrap2 = document.getElementById('authRememberWrap');
  if (remWrap2) remWrap2.hidden = (role === 'admin' || authMode === 'register');
}

/* ============================================================
   Автологин (запоминание сессии)
   ============================================================ */

function showAuthPreloader() {
  const p = document.getElementById('authPreloader');
  if (p) p.style.display = 'grid';
}
function hideAuthPreloader() {
  const p = document.getElementById('authPreloader');
  if (p) p.style.display = 'none';
}

async function tryAutoLogin() {
  const name = getCurrentUser();
  if (!name) return false;

  // Есть сохранённое имя — пробуем войти автоматически
  showAuthPreloader();

  // Оффлайн — сразу показываем тост и возвращаем форму
  if (navigator.onLine === false) {
    hideAuthPreloader();
    showToast('Нет соединения с интернетом', 'warning', 4000);
    return false;
  }

  let user = null;
  try {
    user = await fbGetUser(name, { silent: true });
  } catch (e) {
    user = null;
  }

  if (!user || user.blocked) {
    // Профиль не найден или заблокирован — чистим и показываем форму
    clearCurrentUser();
    hideAuthPreloader();
    return false;
  }

  // Всё ок — редирект по роли
  if (user.role === 'admin') {
    window.location.href = 'adminPage/adminPage.html';
  } else {
    window.location.href = 'dictionary/dictionary.html';
  }
  return true;
}

/* Обработка submit */
async function authSubmitHandler(e) {
  e.preventDefault();
  clearAuthErrors();

  const name = document.getElementById('authName').value.trim();
  const pass = document.getElementById('authPass').value;
  const confirm = document.getElementById('authConfirm').value;

  let hasError = false;

  if (!name) {
    document.getElementById('authNameErr').textContent = authRole === 'admin' ? 'Введите email' : 'Введите имя';
    document.getElementById('authName').classList.add('error');
    hasError = true;
  }
   if (!pass) {
    document.getElementById('authPassErr').textContent = 'Введите пароль';
    document.getElementById('authPass').classList.add('error');
    hasError = true;
  } else if (authRole === 'user' && authMode === 'register' && pass.length < PASSWORD_MIN) {
    document.getElementById('authPassErr').textContent = `Минимум ${PASSWORD_MIN} символов`;
    document.getElementById('authPass').classList.add('error');
    hasError = true;
  }
  if (authRole === 'user' && authMode === 'register' && pass && confirm !== pass) {
    document.getElementById('authConfirmErr').textContent = 'Пароли не совпадают';
    document.getElementById('authConfirm').classList.add('error');
    hasError = true;
  }
  if (hasError) return;

  const submitBtn = document.getElementById('authSubmit');
  submitBtn.disabled = true;
  const origText = submitBtn.textContent;
  submitBtn.textContent = 'Проверяю...';

  try {
    if (authRole === 'admin') {
      await handleAdminLogin(name, pass);
    } else if (authMode === 'register') {
      await handleRegister(name, pass);
    } else {
      await handleLogin(name, pass);
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = origText;
  }
}

/* Админ: Firebase Auth */
async function handleAdminLogin(email, password) {
  try {
    await firebase.auth().signInWithEmailAndPassword(email, password);
    window.location.href = 'adminPage/adminPage.html';
  } catch (e) {
    const errEl = document.getElementById('authPassErr');
    if (e.code === 'auth/user-not-found' ||
        e.code === 'auth/wrong-password' ||
        e.code === 'auth/invalid-credential') {
      errEl.textContent = 'Неверный email или пароль';
    } else if (e.code === 'auth/invalid-email') {
      errEl.textContent = 'Некорректный email';
    } else {
      errEl.textContent = 'Ошибка входа: ' + e.code;
    }
    document.getElementById('authName').classList.add('error');
    document.getElementById('authPass').classList.add('error');
  }
}

/* Пользователь: localStorage */
async function handleRegister(name, pass) {
  const existing = await fbGetUser(name);
  if (existing) {
    document.getElementById('authNameErr').textContent = 'Такое имя уже занято';
    document.getElementById('authName').classList.add('error');
    return;
  }

  const passHash = await fbHashPassword(name, pass);
  const ok = await fbCreateUser(name, passHash, 'user');
  if (!ok) {
    document.getElementById('authNameErr').textContent = 'Не удалось создать аккаунт. Попробуйте позже.';
    return;
  }

  await fbSaveState(name, {
    theme: 'light',
    activeSectionId: 'all',
    shuffle: false,
    currentPage: 1,
    visits: [],
    sections: [],
    words: [],
  });

    if (getRememberMe()) setCurrentUser(name);
  else clearCurrentUser();
  setLastUser(name);
  window.location.href = 'dictionary/dictionary.html';
}

async function handleLogin(name, pass) {
  const user = await fbGetUser(name);

  if (!user) {
    document.getElementById('authPassErr').textContent = 'Неверное имя или пароль';
    document.getElementById('authName').classList.add('error');
    document.getElementById('authPass').classList.add('error');
    return;
  }

  const hash = await fbHashPassword(name, pass);
  if (user.passHash !== hash) {
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

    if (getRememberMe()) setCurrentUser(user.name);
  else clearCurrentUser();
  setLastUser(user.name);
  if (user.role === 'admin') {
    window.location.href = 'adminPage/adminPage.html';
  } else {
    window.location.href = 'dictionary/dictionary.html';
  }
}

/* Инициализация */
async function init() {
  applyTheme();

  // Пробуем автологин — если получится, уйдём на редирект
  const autoLoggedIn = await tryAutoLogin();
  if (autoLoggedIn) return;

  document.getElementById('authForm').addEventListener('submit', authSubmitHandler);
  document.getElementById('authSwitch').addEventListener('click', () => {
    setAuthMode(authMode === 'login' ? 'register' : 'login');
  });
  document.getElementById('authAdminSwitch').addEventListener('click', () => {
    setAuthRole(authRole === 'admin' ? 'user' : 'admin');
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

    document.querySelectorAll('.auth-eye').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-eye-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      const wasShowing = input.type === 'text';
      input.type = wasShowing ? 'password' : 'text';
      btn.classList.toggle('showing', !wasShowing);
      btn.setAttribute('aria-label', wasShowing ? 'Показать пароль' : 'Скрыть пароль');
      input.focus();
    });
  });

  const remEl = document.getElementById('authRemember');
  if (remEl) {
    remEl.checked = getRememberMe();
    remEl.addEventListener('change', () => {
      setRememberMe(remEl.checked);
      if (!remEl.checked) clearCurrentUser();
    });
  }

  setAuthRole('user');
  setTimeout(() => {
    const n = document.getElementById('authName');
    if (n) n.focus();
  }, 80);
}

init();

/* ============================================================
   PWA — Service Worker
   ============================================================ */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('service-worker.js', {
        updateViaCache: 'none'
      });
      await reg.update();
    } catch (err) {
      console.warn('[PWA] SW registration failed:', err);
    }
  });
}