// アプリ外殻をキャッシュし、2回目以降は通信を待たずに開く
const CACHE = 'km-shell-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (req.mode === 'navigate') {
    // stale-while-revalidate: キャッシュを即返し、裏で更新
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match('/');
        const net = fetch(req)
          .then((r) => {
            if (r.ok) c.put('/', r.clone());
            return r;
          })
          .catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || /\.(svg|png|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const r = await fetch(req);
        if (r.ok) c.put(req, r.clone());
        return r;
      }),
    );
  }
});
