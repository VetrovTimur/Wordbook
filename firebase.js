/* Firebase init */
const firebaseConfig = {
  apiKey: "AIzaSyD3ghA-kjhcJ4c1f-9YNimjtPUecJ1N8ho",
  authDomain: "wordbook-app-db.firebaseapp.com",
  projectId: "wordbook-app-db",
  storageBucket: "wordbook-app-db.firebasestorage.app",
  messagingSenderId: "856982891717",
  appId: "1:856982891717:web:432766eb0cc10cebfb94ac"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* Toast-уведомления */
(function injectToastStyles() {
  if (document.getElementById('wb-toast-styles')) return;
  const style = document.createElement('style');
  style.id = 'wb-toast-styles';
  style.textContent = `
    #wb-toast-container {
      position: fixed; top: 20px; right: 20px; z-index: 9999;
      display: flex; flex-direction: column; gap: 10px;
      max-width: 360px; pointer-events: none;
      font-family: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
    }
    .wb-toast {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 14px;
      background: var(--paper, #f5efe2); color: var(--ink, #2b2118);
      border: 1px solid var(--border, #c9bca4); border-left-width: 3px;
      border-radius: 4px; box-shadow: 0 6px 24px rgba(80, 55, 30, 0.22);
      font-size: 14px; line-height: 1.4; pointer-events: auto;
      opacity: 0; transform: translateX(20px);
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    .wb-toast--show { opacity: 1; transform: translateX(0); }
    .wb-toast--error { border-left-color: var(--danger, #8b3a3a); }
    .wb-toast--error .wb-toast__icon { color: var(--danger, #8b3a3a); }
    .wb-toast--warning { border-left-color: var(--gold, #b08d57); }
    .wb-toast--warning .wb-toast__icon { color: var(--gold, #b08d57); }
    .wb-toast--info { border-left-color: var(--accent, #7a5c3e); }
    .wb-toast--info .wb-toast__icon { color: var(--accent, #7a5c3e); }
    .wb-toast__icon { flex-shrink: 0; width: 18px; height: 18px; display: grid; place-items: center; margin-top: 1px; }
    .wb-toast__icon svg { width: 18px; height: 18px; }
    .wb-toast__text { flex: 1; font-style: italic; min-width: 0; word-wrap: break-word; }
    .wb-toast__close { flex-shrink: 0; background: transparent; border: none; color: var(--ink-3, #97867a); cursor: pointer; font-size: 20px; line-height: 1; padding: 0; margin-top: -2px; transition: color 0.15s ease; font-family: inherit; }
    .wb-toast__close:hover { color: var(--ink, #2b2118); }
    @media (max-width: 640px) {
      #wb-toast-container { top: 10px; right: 10px; left: 10px; max-width: none; }
    }
  `;
  document.head.appendChild(style);
})();

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

/* Обёртка Firestore-запросов */
const FB_TIMEOUT_MS = 20000;
const FB_WRITE_TIMEOUT_MS = 30000;

async function fbFetch(promiseFactory, errorContext, fallback = null, options = {}) {
  const { silent = false, writeTimeout } = options;
  const timeoutMs = writeTimeout || FB_TIMEOUT_MS;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (!silent) showToast('Нет соединения с интернетом', 'warning');
    return fallback;
  }

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
  });

  try {
    const result = await Promise.race([promiseFactory(), timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (e) {
    clearTimeout(timeoutId);
    console.error('[Firebase]', errorContext, '| code =', e && e.code, '| msg =', e && e.message, e);

    if (silent) return fallback;

    const isTransient = e && (
      e.message === 'TIMEOUT' ||
      e.code === 'unavailable' ||
      e.code === 'deadline-exceeded' ||
      e.code === 'cancelled'
    );
    if (isTransient) return fallback;

    showToast(errorContext, 'error');
    return fallback;
  }
}

/* Хэш пароля: SHA-256 с солью имени пользователя.
   Формат хранения: "sha256:<64 hex>". */
async function fbHashPassword(name, pass) {
  const data = new TextEncoder().encode('wordbook::' + name + '::' + pass);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return 'sha256:' + hex;
}

/* Пользователи */
async function fbGetUser(name) {
  return fbFetch(
    () => db.collection('users').doc(name).get().then(snap => snap.exists ? { name, ...snap.data() } : null),
    'Не удалось загрузить профиль',
    null
  );
}

async function fbCreateUser(name, passHash, role = 'user') {
  return fbFetch(
    () => db.collection('users').doc(name).set({
      name, passHash, role, blocked: false, createdAt: Date.now(),
    }).then(() => true),
    'Не удалось создать аккаунт',
    false,
    { writeTimeout: FB_WRITE_TIMEOUT_MS }
  );
}

async function fbUpdateUser(name, patch) {
  try {
    await db.collection('users').doc(name).set(patch, { merge: true });
    return true;
  } catch (e) {
    console.warn('[Firebase] fbUpdateUser write failed, verifying...', e && e.code, e && e.message);
    try {
      await db.waitForPendingWrites();
      const snap = await db.collection('users').doc(name).get({ source: 'server' });
      if (snap.exists) {
        const data = snap.data() || {};
        const applied = Object.keys(patch).every(k => data[k] === patch[k]);
        if (applied) return true;
      }
    } catch (verifyErr) {
      console.warn('[Firebase] fbUpdateUser verify failed:', verifyErr);
      return true;
    }
    return false;
  }
}

async function fbDeleteUser(name) {
  const deleteOk = await fbFetch(
    async () => {
      await db.collection('users').doc(name).delete();
      await db.collection('states').doc(name).delete();
      return true;
    },
    'Не удалось удалить пользователя',
    false,
    { silent: true, writeTimeout: FB_WRITE_TIMEOUT_MS }
  );
  if (deleteOk) return true;

  try {
    const snap = await db.collection('users').doc(name).get();
    if (!snap.exists) return true;
  } catch (e) { /* ignore */ }
  showToast('Не удалось удалить пользователя', 'error');
  return false;
}

async function fbGetAllUsers() {
  return fbFetch(
    () => db.collection('users').get().then(snap => {
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      return list;
    }),
    'Не удалось загрузить список пользователей',
    []
  );
}

/* State словаря пользователя */
async function fbLoadState(name) {
  return fbFetch(
    () => db.collection('states').doc(name).get().then(snap => snap.exists ? snap.data() : null),
    'Не удалось загрузить словарь',
    null
  );
}

async function fbSaveState(name, state) {
  return fbFetch(
    () => db.collection('states').doc(name).set({ ...state, updatedAt: Date.now() }).then(() => true),
    'Не удалось сохранить изменения',
    false,
    { silent: true, writeTimeout: FB_WRITE_TIMEOUT_MS }
  );
}

/* Журнал */
async function fbAddLog(type, target, details) {
  return fbFetch(
    () => db.collection('logs').add({
      type, target: target || '—', details: details || '', ts: Date.now(),
    }).then(() => true),
    'Не удалось записать в журнал',
    false,
    { silent: true, writeTimeout: FB_WRITE_TIMEOUT_MS }
  );
}

async function fbGetLogs(limit = 500) {
  return fbFetch(
    () => db.collection('logs').orderBy('ts', 'desc').limit(limit).get().then(snap => {
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      return list;
    }),
    'Не удалось загрузить журнал',
    []
  );
}

async function fbClearLogs() {
  return fbFetch(
    async () => {
      const snap = await db.collection('logs').get();
      const batch = db.batch();
      snap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      return true;
    },
    'Не удалось очистить журнал',
    false,
    { writeTimeout: FB_WRITE_TIMEOUT_MS }
  );
}

/* Обратная связь */
async function fbAddFeedback(userName, text) {
  return fbFetch(
    () => db.collection('feedback').add({
      userName,
      text,
      ts: Date.now(),
      read: false,
    }).then(() => true),
    'Не удалось отправить сообщение',
    false,
    { writeTimeout: FB_WRITE_TIMEOUT_MS }
  );
}

async function fbGetAllFeedback(limit = 500) {
  return fbFetch(
    () => db.collection('feedback').orderBy('ts', 'desc').limit(limit).get().then(snap => {
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      return list;
    }),
    'Не удалось загрузить сообщения',
    []
  );
}

async function fbMarkFeedbackRead(id, read = true) {
  return fbFetch(
    () => db.collection('feedback').doc(id).update({ read }).then(() => true),
    'Не удалось обновить сообщение',
    false,
    { silent: true, writeTimeout: FB_WRITE_TIMEOUT_MS }
  );
}

async function fbDeleteFeedback(id) {
  return fbFetch(
    () => db.collection('feedback').doc(id).delete().then(() => true),
    'Не удалось удалить сообщение',
    false,
    { writeTimeout: FB_WRITE_TIMEOUT_MS }
  );
}