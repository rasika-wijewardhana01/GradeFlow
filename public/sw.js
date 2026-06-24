// ─────────────────────────────────────────────────────────────────────────────
//  sw.js  —  GradeFlow Service Worker
//
//  IMPORTANT: This file lives in public/ so Vite copies it verbatim to dist/.
//  It must NOT be imported as a module — it is registered via
//  navigator.serviceWorker.register('/sw.js') in sw-registration.js.
//
//  Pre-cache strategy:
//    • Shell assets (index + manifest) are pre-cached on install for offline-first.
//    • Hashed JS/CSS bundles are NOT in this list — Vite fingerprints them so
//      their exact filenames are unknown at SW author-time. They are cached
//      automatically by the fetch handler on first access.
//    • CDN libraries are pre-cached so the app works fully offline after the
//      first visit.
//
//  ⚠  CACHE_NAME must be bumped whenever code changes are deployed.
//     The activate handler deletes every cache that does NOT match this name,
//     forcing browsers to re-fetch index.html and all JS bundles from the
//     network.  Leaving the name unchanged = stale code survives deploys.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'gradeflow-v9'; // ← bumped from v8 — purges stale IDB-fix code

// Only list files whose paths are stable (not fingerprinted by Vite).
// /style.css is intentionally absent — after the Vite build it becomes
// /src/main-[hash].css and pre-caching a non-existent path would crash install.
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Skip non-GET requests
  if (e.request.method !== 'GET') return;

  // Skip non-http(s) (chrome-extension://, etc.)
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;

  // Skip Vite dev-server internals (no-op in production, safety guard for dev)
  if (url.includes('/@vite/') || url.includes('/__vite') || url.includes('/node_modules/')) return;

  // ── index.html — network-first ──────────────────────────────────────────
  // Always try the network for the HTML shell so a fresh deploy is picked up
  // immediately.  Fall back to cache only when truly offline.
  const isHtml = url.endsWith('/') || url.endsWith('/index.html') ||
                 (!url.includes('.') && new URL(url).pathname.startsWith('/'));
  if (isHtml) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp.ok) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, resp.clone()));
          }
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // ── All other assets — cache-first ──────────────────────────────────────
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        // Cache valid same-origin responses and CDN responses (non-opaque)
        if (resp.ok && resp.type !== 'opaque') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, clone).catch(() => {
              // Silently ignore cache.put failures (quota exceeded, etc.)
            });
          });
        }
        return resp;
      }).catch(() => cached || new Response('GradeFlow is offline', { status: 503 }));
    })
  );
});

// Handle skip-waiting message from the in-app update banner
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
