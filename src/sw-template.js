// 빌드 시 vite.config.ts가 버전과 파일 목록을 채워 dist/sw.js로 만든다.
// 같은 origin을 다른 앱과 공유하므로 htd- 접두사 캐시만 만들고 지운다.
const CACHE = 'htd-__VERSION__';
const ASSETS = __ASSETS__;
const SCOPE = new URL(self.registration.scope);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((a) => new URL(a, SCOPE).href))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('htd-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(CACHE).then((c) => c.match(new URL('./', SCOPE).href)).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.open(CACHE).then((c) => c.match(req)).then((r) => r || fetch(req)));
});
