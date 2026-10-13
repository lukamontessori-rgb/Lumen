// Lumen service worker: lets the page itself open without internet after the first visit.
// The AI model files are cached separately by the WebLLM engine (in its own "webllm/..." caches).
// The page libraries are part of this site (the folder vendor/), so they are cached like the page itself.
const SHELL = 'lumen-shell-v16';
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png',
  './vendor/marked-18.0.14/marked.umd.js', './vendor/dompurify-3.4.16/purify.min.js', './vendor/katex-0.18.9/katex.min.js',
  './vendor/katex-0.18.9/katex.min.css', './vendor/highlight.js-11.12.0/highlight.min.js'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(cache => Promise.allSettled(SHELL_FILES.map(f => cache.add(f))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('lumen-') && k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The app's own files: try the network first so updates arrive, fall back to the saved copy offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
    );
    return;
  }

  // Everything else (model files, Wikipedia) goes straight to the network.
});
