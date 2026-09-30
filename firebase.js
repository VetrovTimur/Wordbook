/* ============================================================
   FIREBASE INIT
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyAAEJWXHDZjbN7_IRH4pQA0uM0kDIB6WvU",
  authDomain: "wordbook-app-db.firebaseapp.com",
  projectId: "wordbook-app-db",
  storageBucket: "wordbook-app-db.firebasestorage.app",
  messagingSenderId: "856982891717",
  appId: "1:856982891717:web:fd7c7ee8dbe68f2efb94ac"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

console.log('[Firebase] Инициализирован. Проект:', firebaseConfig.projectId);

/* ============================================================
   УТИЛИТЫ
   ============================================================ */

/* Тот же простой хэш, что и раньше. Считается синхронно,
   результат — hex-строка. */
function fbSimpleHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

/* ============================================================
   USERS
   ============================================================ */

/* Получить пользователя по имени. Возвращает объект или null. */
async function fbGetUser(name) {
  try {
    const snap = await db.collection('users').doc(name).get();
    if (!snap.exists) return null;
    return { name, ...snap.data() };
  } catch (e) {
    console.error('[fbGetUser]', e);
    return null;
  }
}

/* Создать пользователя. role по умолчанию 'user'. */
async function fbCreateUser(name, passHash, role = 'user') {
  try {
    await db.collection('users').doc(name).set({
      name,
      passHash,
      role,
      blocked: false,
      createdAt: Date.now(),
    });
    return true;
  } catch (e) {
    console.error('[fbCreateUser]', e);
    return false;
  }
}

/* Обновить часть полей. patch = { blocked: true } например. */
async function fbUpdateUser(name, patch) {
  try {
    await db.collection('users').doc(name).update(patch);
    return true;
  } catch (e) {
    console.error('[fbUpdateUser]', e);
    return false;
  }
}

/* Удалить пользователя и его состояние. */
async function fbDeleteUser(name) {
  try {
    await db.collection('users').doc(name).delete();
    await db.collection('states').doc(name).delete();
    return true;
  } catch (e) {
    console.error('[fbDeleteUser]', e);
    return false;
  }
}

/* Получить всех пользователей (для админки). */
async function fbGetAllUsers() {
  try {
    const snap = await db.collection('users').get();
    const list = [];
    snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    return list;
  } catch (e) {
    console.error('[fbGetAllUsers]', e);
    return [];
  }
}

/* ============================================================
   STATES (словарь пользователя)
   ============================================================ */

/* Прочитать state. Если нет — вернёт null. */
async function fbLoadState(name) {
  try {
    const snap = await db.collection('states').doc(name).get();
    if (!snap.exists) return null;
    return snap.data();
  } catch (e) {
    console.error('[fbLoadState]', e);
    return null;
  }
}

/* Сохранить state. Полностью перезаписываем документ. */
async function fbSaveState(name, state) {
  try {
    await db.collection('states').doc(name).set({
      ...state,
      updatedAt: Date.now(),
    });
    return true;
  } catch (e) {
    console.error('[fbSaveState]', e);
    return false;
  }
}

/* ============================================================
   LOGS
   ============================================================ */

async function fbAddLog(type, target, details) {
  try {
    await db.collection('logs').add({
      type,
      target: target || '—',
      details: details || '',
      ts: Date.now(),
    });
    return true;
  } catch (e) {
    console.error('[fbAddLog]', e);
    return false;
  }
}

async function fbGetLogs(limit = 500) {
  try {
    const snap = await db.collection('logs')
      .orderBy('ts', 'desc')
      .limit(limit)
      .get();
    const list = [];
    snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    return list;
  } catch (e) {
    console.error('[fbGetLogs]', e);
    return [];
  }
}

async function fbClearLogs() {
  try {
    const snap = await db.collection('logs').get();
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    return true;
  } catch (e) {
    console.error('[fbClearLogs]', e);
    return false;
  }
}