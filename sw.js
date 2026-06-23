const CACHE_NAME = 'gradeflow-v6';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS.filter(url => !url.startsWith('https://fonts.'))))
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
  // Skip non-http(s) requests (chrome-extension://, etc.)
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;
  // Skip Vite HMR websocket and dev-server internals
  if (url.includes('/@vite/') || url.includes('/__vite') || url.includes('/node_modules/')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        // Only cache valid same-origin or CDN responses
        if (resp.ok && resp.type !== 'opaque') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, clone).catch(() => {
              // Silently ignore cache.put failures (e.g. opaque responses, quota exceeded)
            });
          });
        }
        return resp;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});

// Handle skip-waiting message from update banner
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
