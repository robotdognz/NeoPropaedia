const CACHE_NAME = 'propaedia-v5';
const BASE = '/NeoPropaedia/';
const OFFLINE_DOWNLOAD_HEADER = 'x-propaedia-offline-download';
const FULL_SITE_CACHE_PREFIX = 'propaedia-full-site-';

// Pre-cached on install: homepage, about, offline, plus Part and Division pages for core offline navigation
const PRECACHE_URLS = [
  BASE,
  BASE + 'about/',
  BASE + 'offline/',
  // Part pages
  ...Array.from({ length: 10 }, (_, i) => BASE + 'part/' + (i + 1) + '/'),
  // Division pages are added dynamically by the build step below
];

// Division URLs injected at build time (placeholder replaced by post-build script)
const DIVISION_URLS = /*INJECT_DIVISION_URLS*/[];
PRECACHE_URLS.push(...DIVISION_URLS);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('Failed to pre-cache:', url, err);
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && !name.startsWith(FULL_SITE_CACHE_PREFIX))
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.includes(BASE)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && event.request.headers.get(OFFLINE_DOWNLOAD_HEADER) !== '1') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        const ignoreSearch = event.request.mode === 'navigate';
        const cached = await caches.match(event.request, { ignoreSearch });
        if (cached) return cached;

        if (event.request.mode === 'navigate') {
          return (await caches.match(BASE)) || Response.error();
        }

        return Response.error();
      })
  );
});
