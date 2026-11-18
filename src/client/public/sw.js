// アプリ外殻をキャッシュし、2回目以降は通信を待たずに開く
// 置き場所（ドメイン直下 / サブパス）に関係なく動くよう、登録スコープを基準にする
const CACHE = 'soubacho-shell-v1';
const ROOT = new URL('./', self.registration.scope).pathname;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([ROOT])));
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
  const path = url.pathname;
  if (path.startsWith(`${ROOT}api/`) || path.startsWith(`${ROOT}auth/`)) return;

  if (req.mode === 'navigate') {
    // stale-while-revalidate: キャッシュを即返し、裏で更新
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(ROOT);
        const net = fetch(req)
          .then((r) => {
            if (r.ok) c.put(ROOT, r.clone());
            return r;
          })
          .catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }

  if (path.startsWith(`${ROOT}assets/`) || /\.(svg|png|webmanifest)$/.test(path)) {
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
