// Minimal service worker — its only jobs are:
//   1) Satisfy the browser's "installable PWA" requirement (a registered SW
//      with a fetch handler is required by Chrome/Android before it will
//      offer "Add to Home Screen" as a full app instead of a bookmark).
//   2) Let the app still open (from cache) if the phone is briefly offline.
//
// IMPORTANT: the main app HTML is always fetched from the NETWORK FIRST,
// falling back to a cached copy only if there's no connection. This means
// every time you upload a new version of the app, the very next time it's
// opened it gets the latest file — it never gets "stuck" showing an old
// cached version. Only rarely-changing assets (icons, manifest) use a
// cache-first strategy, since those essentially never change.
//
// It never intercepts calls to your Apps Script Web App or any other
// cross-origin request — those always go straight to the network, so
// sales/stock data is never served stale.

const CACHE_NAME = "aadhya-pos-shell-v2"; // bump this number whenever you want to force-clear old caches
const APP_SHELL = [
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Only handle GET requests to OUR OWN origin. Everything else — the Apps
  // Script API, CDN scripts for the barcode/camera libraries, etc. — goes
  // straight to the network untouched.
  if (req.method !== "GET" || !isSameOrigin) return;

  const isHTML = req.mode === "navigate" || url.pathname.endsWith(".html");

  if (isHTML) {
    // NETWORK-FIRST: always get the latest app version when online.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req)) // offline fallback only
    );
    return;
  }

  // CACHE-FIRST for static assets (icons, manifest) that rarely change.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

