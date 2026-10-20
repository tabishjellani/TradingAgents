/* ==========================================================================
   TradingAgents Service Worker (PWA Offline Engine)
   ========================================================================== */

const CACHE_NAME = 'tradingagents-v0.7.0';

// App shell and static assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
];

// Install Event: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Stale-While-Revalidate for app shell, Network-First for APIs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NEVER cache authentication endpoints, tokens, or live WebSocket connections
  if (
    url.pathname.startsWith('/api/v1/auth') ||
    url.pathname.includes('/auth/v1') ||
    url.pathname.includes('/user/profile') ||
    url.pathname.includes('/admin') ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:'
  ) {
    return; // Pass through to network directly without caching
  }

  // API Requests: Network-First with safe offline JSON fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(async () => {
        // If offline and requesting report, try cache
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response(
          JSON.stringify({
            error: 'Offline',
            message: 'You are currently offline. Showing cached reports where available.',
            is_offline: true,
          }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 503,
          }
        );
      })
    );
    return;
  }

  // Static Assets & App Shell: Cache-First with Network fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch updated asset in background
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (
          !networkResponse ||
          networkResponse.status !== 200 ||
          networkResponse.type !== 'basic'
        ) {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Offline navigation fallback
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
