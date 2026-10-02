const CACHE_VERSION = 'wordbook-v14';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './firebase.js',
  './dictionary/dictionary.html',
  './dictionary/dictionary.css',
  './dictionary/dictionary.js',
  './adminPage/adminPage.html',
  './adminPage/adminPage.css',
  './adminPage/adminPage.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(c => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Внешние домены (Firebase, Google, воркер, CDN) — не трогаем
  const skipHosts = [
    'firestore', 'firebase', 'googleapis', 'gstatic',
    'workers.dev', 'sheetjs', 'jsdelivr', 'unpkg'
  ];
  if (skipHosts.some(h => url.hostname.includes(h))) return;

  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // HTML — network-first (всегда свежая версия, фолбэк на кэш)
  const isHtml = req.headers.get('accept')?.includes('text/html')
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('/');

  if (isHtml) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Остальное — cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      });
    })
  );
});