/**
 * Service worker (Phase 14, PRD sections 40-41).
 *
 * Offline strategy (PRD section 41): cache STATIC frontend assets only.
 * API responses are never cached and no financial data is ever stored
 * offline - the app must never pretend transactions were synchronized.
 * Pages already render a clear error when the API is unreachable, and
 * pwa.js shows the offline banner (PRD section 41 copy).
 */
'use strict';

var CACHE_NAME = 'cashflow-static-v1';

var PRECACHE_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/dashboard.html',
  '/transactions.html',
  '/reports.html',
  '/settings.html',
  '/css/style.css',
  '/js/api.js',
  '/js/app.js',
  '/js/auth.js',
  '/js/format.js',
  '/js/pwa.js',
  '/js/transactionModal.js',
  '/js/dashboard.js',
  '/js/transactions.js',
  '/js/categories.js',
  '/js/settings.js',
  '/js/reports.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(PRECACHE_URLS);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== CACHE_NAME;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  // Only handle same-origin GETs.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // The API is always a network call (PRD section 41): no offline financial
  // data, no stale balances.
  if (new URL(request.url).pathname.startsWith('/api/')) {
    return;
  }

  // Stale-while-revalidate for the static shell: instant offline load,
  // refreshed in the background when online.
  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(request).then(function (cached) {
        var network = fetch(request)
          .then(function (response) {
            if (response && response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(function () {
            // Offline: fall back to cache; navigations fall back to the shell.
            if (cached) return cached;
            if (request.mode === 'navigate') {
              return cache.match('/index.html');
            }
            return undefined;
          });
        return cached || network;
      });
    })
  );
});
