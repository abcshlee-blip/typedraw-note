/* TypeDraw 노트 — 오프라인 우선 Service Worker */
const CACHE = 'typedraw-note-v13';
const CORE = [
  './',
  './index.html',
  './styles.css?v=13',
  './app.js?v=13',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  // 새 워커를 '대기'시키지 않고 바로 활성화 단계로 올린다
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(
        CORE.map((u) => fetch(new Request(u, { cache: 'reload' }))
          .then((res) => (res && res.ok ? cache.put(u, res) : null))
          .catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())   // 열려 있는 화면도 바로 새 워커가 맡는다
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 버전 확인 파일은 캐시에 담지 않고 항상 네트워크에서 받는다
  if (url.pathname.endsWith('/version.txt')) return;

  // 페이지 이동: 네트워크 우선, 실패하면 캐시된 index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 구글 폰트: 캐시 우선 (한 번 받으면 오프라인에서도 손글씨 폰트 유지)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // 같은 출처 자산: 캐시 우선 (파일 이름에 ?v=버전을 붙여 새 버전 때 새 주소가 되게 한다)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
