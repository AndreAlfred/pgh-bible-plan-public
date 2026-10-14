// Offline support. Two rules keep it from ever pinning a phone to an old release:
//  - the app itself (page, app.js, styles.css) is network-first, so a deploy is
//    picked up on the next online load; the cache is only the offline fallback;
//  - KJV chapter files never change, so they are cache-first.
// Bump VERSION only when the cache layout itself changes.
const VERSION = "v1";
const SHELL = `pgh-shell-${VERSION}`;
const KJV = `pgh-kjv-${VERSION}`;
const FONTS = `pgh-fonts-${VERSION}`;
const SHELL_FILES = ["/", "/app.js", "/styles.css", "/manifest.webmanifest", "/icon.svg", "/apple-touch-icon.png"];
// On a weak signal ("lie-fi") the network can hang rather than fail; give up and
// use the saved copy after this long.
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  const keep = new Set([SHELL, KJV, FONTS]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(r => { clearTimeout(timer); resolve(r); }, e => { clearTimeout(timer); reject(e); });
  });
}

// The page asks for app.js?v=… and styles.css?v=…; the query is a cache-buster
// for the HTTP cache, so offline lookups ignore it.
async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok) cache.put(stripSearch(request), response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true })
      || (request.mode === "navigate" && await cache.match("/"));
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Opaque (status 0) responses are fine for cross-origin font files.
  if (response.ok || response.type === "opaque") cache.put(request, response.clone());
  return response;
}

const stripSearch = request => {
  const url = new URL(request.url);
  url.search = "";
  return url.href;
};

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === location.origin) {
    if (url.pathname.startsWith("/data/kjv/")) event.respondWith(cacheFirst(request, KJV));
    else if (request.mode === "navigate" || SHELL_FILES.includes(url.pathname)) event.respondWith(networkFirst(request));
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request, FONTS));
  }
});

// The page sends the coming week's chapter files; fetch whichever aren't saved yet.
self.addEventListener("message", event => {
  if (event.data?.type !== "prefetch" || !Array.isArray(event.data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(KJV);
    for (const url of event.data.urls) {
      if (await cache.match(url)) continue;
      try {
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response);
      } catch { /* offline or missing; the next visit tries again */ }
    }
  })());
});
