// App shell cached for instant chromeless launch from the Home Screen.
// Live data is NEVER served stale from cache: API calls bypass the worker
// entirely, and data/*.json is network-first with cache only as a fallback.
const V = 'myplayers-v1';
const SHELL = [
  './', 'index.html', 'manifest.json',
  'js/app.js', 'js/data.js', 'js/scoring.js', 'js/statline.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Live feeds: always straight to the network, never cached.
  if (url.origin !== location.origin) return;

  if (url.pathname.includes('/data/')) {
    e.respondWith(fetch(e.request)
      .then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
