// Service worker for the Colegios-Hub console.
//
// Deliberately narrow: it caches static assets and nothing else.
//
// It used to precache '/' and '/login' as an offline app shell. That is a trap
// for a Next.js app — the HTML carries references to content-hashed bundles in
// /_next/, which this worker intentionally does NOT cache. A cached document
// therefore pairs OLD server HTML with NEW client JS after any deploy, and
// React fails to hydrate ("some attributes of the server rendered HTML didn't
// match"). An operator console is useless offline anyway (every screen reads
// from a remote API), so the shell bought nothing and cost correctness.
//
// Bump CACHE_NAME on every change to this file — the activate handler deletes
// every cache that does not match, which is what evicts the previous version.
const CACHE_NAME = 'colegios-hub-v2';

// Static, versioned-by-content assets only. No HTML.
const PRECACHE = [
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // addAll is all-or-nothing; a single 404 would abort the install and
      // leave the app with no worker at all, so each entry is added on its own.
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) =>
            cache
              .add(url)
              .catch((err) => console.warn('[SW] skipped precache:', url, err)),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

// Lets the page activate a waiting worker without a manual reload.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  // The console reads from sms-hub-backend, sms-backend and S3 — all
  // cross-origin, all either authenticated or tenant-specific. Never touch
  // them: no respondWith means the browser handles the request natively,
  // so CORS and auth behave exactly as they would with no worker installed.
  if (url.origin !== self.location.origin) return;

  // Next's bundles are content-hashed in production, so the HTTP cache already
  // handles them correctly; in dev the names are stable while contents change.
  if (url.pathname.startsWith('/_next/')) return;

  // Documents always come from the network, so the HTML can never disagree
  // with the bundles it references. See the note at the top of this file.
  if (event.request.mode === 'navigate') return;

  // Cache-first for icons and static images — they change only when the
  // generator is re-run, and CACHE_NAME changes with it.
  if (
    url.pathname.startsWith('/icons/') ||
    /\.(png|jpg|jpeg|svg|ico|webp)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const copy = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy));
            return response;
          }),
      ),
    );
  }
});
