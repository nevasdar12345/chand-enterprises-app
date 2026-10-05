// Chand Enterprises service worker
//
// Strategy
//  - Versioned static files (/static/...?v=123): CACHE-FIRST. The URL changes on every
//    deploy, so a cached copy is always the right one and loads instantly.
//  - Everything else (home page, brochure, ...): NETWORK-FIRST, with the cached copy
//    used only when the phone is offline.
//  - /api/, /admin/, /dashboard, /staff, /logout, /health are never touched.

const CACHE = "chand-enterprises-v5";

const APP_SHELL = [
  "/",
  "/static/style.css",
  "/static/responsive.css",
  "/static/site-pages.css",
  "/static/app.js",
  "/static/location.js",
  "/static/js/responsive.js",
  "/static/manifest.webmanifest",
  "/static/icons/icon.svg",
];

self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      // cache: "reload" = always fetch a fresh copy, never the browser's HTTP cache
      .then((c) => c.addAll(APP_SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  )
);

self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      // Start the page request while the service worker is still waking up
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  )
);

async function cacheFirst(req, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;

  const res = await fetch(req);
  if (res.ok) {
    // remove older versions of this same file, then store the new one
    const keys = await cache.keys();
    await Promise.all(
      keys
        .filter((k) => {
          const u = new URL(k.url);
          return u.pathname === url.pathname && u.search !== url.search;
        })
        .map((k) => cache.delete(k))
    );
    await cache.put(req, res.clone());
  }
  return res;
}

async function networkFirst(e) {
  const req = e.request;
  try {
    const res = (await e.preloadResponse) || (await fetch(req));
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  } catch (err) {
    const cache = await caches.open(CACHE);
    return (
      (await cache.match(req, { ignoreSearch: true })) ||
      (await cache.match("/")) ||
      Response.error()
    );
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  if (
    path.startsWith("/api/") ||
    path.startsWith("/admin/") ||
    path === "/logout" ||
    path === "/dashboard" ||
    path === "/staff" ||
    path === "/health"
  ) {
    return;
  }

  if (path.startsWith("/static/") && url.searchParams.has("v")) {
    e.respondWith(cacheFirst(req, url));
    return;
  }

  e.respondWith(networkFirst(e));
});
