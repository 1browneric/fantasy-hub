// App shell for chromeless launch from the Home Screen.
// Same-origin files are NETWORK-FIRST (a deploy is live on the next open,
// no stale shell), with the cache as the offline fallback. Live feeds on
// other origins bypass the worker entirely and are never cached.
const V = 'fantasyhub-v14';
const SHELL = [
  './', 'index.html', 'manifest.json', 'css/theme.css',
  'js/app.js', 'js/util.js', 'js/model.js', 'js/scoring.js', 'js/statline.js',
  'js/sources/espn.js', 'js/sources/sleeper.js', 'js/sources/rt.js',
  'js/ui/rows.js', 'js/ui/sheet.js', 'js/ui/gamesheet.js', 'js/ui/h2h.js',
  'js/views/home.js', 'js/views/matchup.js', 'js/views/players.js', 'js/views/rosters.js',
  'js/views/standings.js', 'js/views/waivers.js', 'js/views/nfl.js',
  'data/teams.json', 'data/index.json', 'data/leagues.json',
  'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/mark-96.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // Drop old caches, take over every open tab, then reload each one so a
  // page served by an older worker never lingers a load behind.
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x))))
    .then(() => self.clients.claim())
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then(cs => Promise.all(cs.map(c => c.navigate ? c.navigate(c.url).catch(() => {}) : null))));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
