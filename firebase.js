/* firebase.js — инициализация Firebase и все Firestore-функции */

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
async function fbGetUser(name, options = {}) {
  return fbFetch(
    () => db.collection('users').doc(name).get().then(snap => snap.exists ? { name, ...snap.data() } : null),
    'Не удалось загрузить профиль',
    null,
    options
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