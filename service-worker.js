/* =========================================================
   service-worker.js — Jungle Raj PWA
   Strategy: Cache-first for static assets, network-first for data.
   ========================================================= */

const CACHE_NAME    = 'jungleraj-v3';
const DATA_CACHE    = 'jungleraj-data-v1';
const OFFLINE_PAGE  = '/offline.html';

/* Static shell assets — cached on install */
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/favicon.svg',
  '/css/variables.css',
  '/css/base.css',
  '/css/components.css',
  '/css/navbar.css',
  '/css/footer.css',
  '/css/animations.css',
  '/css/home.css',
  '/css/issues.css',
  '/css/politicians.css',
  '/css/statistics.css',
  '/css/surveys.css',
  '/css/storybook.css',
  '/css/news.css',
  '/css/search.css',
  '/css/responsive.css',
  '/js/i18n.js',
  '/js/api.js',
  '/js/components.js',
  '/js/main.js',
  '/js/home.js',
  '/js/issues.js',
  '/js/issue-details.js',
  '/js/politicians.js',
  '/js/statistics.js',
  '/js/surveys.js',
  '/js/storybook.js',
  '/js/news.js',
  '/js/search.js',
  '/pages/issues.html',
  '/pages/politicians.html',
  '/pages/statistics.html',
  '/pages/surveys.html',
  '/pages/storybook.html',
  '/pages/news.html',
  '/pages/issue-details.html',
  '/pages/search.html',
  '/pages/about.html',
  '/pages/contact.html',
  '/pages/privacy.html',
  '/pages/disclaimer.html',
  '/pages/404.html',
];

/* ── Install: cache shell ─────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Shell cache failed:', err))
  );
});

/* ── Activate: prune old caches ───────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== DATA_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: strategy router ──────────────────────────── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle same-origin or CDN fonts/scripts
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // /data/*.json → Network-first, fall back to cache
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(networkFirst(event.request, DATA_CACHE));
    return;
  }

  // CDN requests (Chart.js, fonts) → Cache-first
  if (url.hostname !== location.hostname) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  // HTML pages → Network-first, fall back to offline page
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      networkFirst(event.request, CACHE_NAME)
        .catch(() => caches.match(OFFLINE_PAGE))
    );
    return;
  }

  // Everything else → Cache-first
  event.respondWith(cacheFirst(event.request, CACHE_NAME));
});

/* ── Strategies ────────────────────────────────────────── */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error('Offline and not cached: ' + request.url);
  }
}
