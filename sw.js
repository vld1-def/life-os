// LIFE OS service worker — кеш оболонки (швидкий старт) + сповіщення
const CACHE = 'lifeos-v19';
const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const SHELL = ['./', './index.html', './game.html', './manifest.json', CDN];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Навігація: віддаємо САМЕ запитану сторінку з кешу (index.html або game.html), оновлення у фоні
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(CACHE).then(async c => {
      const cached = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then(r => { if (r && r.status === 200) c.put(req, r.clone()); return r; }).catch(() => null);
      return cached || net || (await c.match('./index.html')) || fetch(req);
    }));
    return;
  }

  // supabase-js з CDN та статика оболонки — cache-first + фонове оновлення
  const isCDN = url.hostname === 'cdn.jsdelivr.net';
  const isShell = url.origin === location.origin && /\.(html|json|css|js|svg|png|webmanifest)$/.test(url.pathname);
  if (isCDN || isShell) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const cached = await c.match(req, { ignoreVary: true });
      const net = fetch(req).then(r => { if (r && r.status === 200) c.put(req, r.clone()); return r; }).catch(() => cached);
      return cached || net;
    }));
  }
  // Усе інше (Supabase REST/Auth, Steam тощо) — напряму в мережу, без кешу
});

// ===== Сповіщення =====
self.addEventListener('push', e => {
  let d = { title: 'LIFE OS', body: 'Нагадування' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: d.icon, badge: d.badge }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cl => {
    for (const c of cl) { if ('focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  }));
});
