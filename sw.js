const CACHE = 'obaidul-mentor-lab-v4';
const SHELL = [
  './','./index.html','./styles.css','./app.js','./sw.js',
  './site.webmanifest','./assets/favicon.svg','./assets/vendor/jszip.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Always prefer fresh encrypted content, but keep an offline fallback.
  if (url.pathname.includes('/data/')) {
    event.respondWith(
      fetch(req, {cache:'no-store'})
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Shell assets use network-first so new GitHub Pages deployments appear promptly.
  event.respondWith(
    fetch(req, {cache:'no-store'})
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
  );
});
