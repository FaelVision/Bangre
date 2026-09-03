/* Bangre offline shell. Bump CACHE_VERSION to invalidate everything. */
const CACHE_VERSION = "v4";
const PAGES_CACHE = `bangre-pages-${CACHE_VERSION}`;
const ASSETS_CACHE = `bangre-assets-${CACHE_VERSION}`;
const OFFLINE_URL = "/hors-ligne";

// Pages worth having available before the user ever visits them offline.
const PRECACHE_PAGES = [
  OFFLINE_URL,
  "/tableau-de-bord",
  "/classes",
  "/eleves",
  "/eleves/nouveau",
  "/retards",
  "/paiements",
  "/passage-annee",
];

const STATIC_ASSET_RE = /\.(?:js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/;
// Never serve a stale answer for these — money, sessions and admin actions.
const NEVER_CACHE_RE = /^\/(api|admin|connexion|inscription)(\/|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES_CACHE);
      // Individually, so one failure (e.g. a page needing a fresh session)
      // does not abort the whole install.
      await Promise.all(
        PRECACHE_PAGES.map(async (url) => {
          try {
            const res = await fetch(url, { credentials: "same-origin" });
            if (res.ok && !res.redirected) await cache.put(url, res);
          } catch {
            /* offline at install time — the page will be cached on first visit */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== PAGES_CACHE && k !== ASSETS_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

/**
 * Network-first for pages: the secretary must see live figures whenever there
 * is a connection, and the last good copy only when there is not.
 */
async function handleNavigation(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const res = await fetch(request);
    // A redirect means "sign in again" — caching it under the requested URL
    // would serve the login page for the dashboard once offline.
    if (res.ok && !res.redirected) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = (await cache.match(request)) || (await cache.match(new URL(request.url).pathname));
    if (cached) return cached;
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("Hors ligne", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

/** Assets are immutable in practice: serve from cache, refresh in the background. */
async function handleAsset(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    network.catch(() => {});
    return cached;
  }
  const res = await network;
  if (res) return res;
  return new Response("", { status: 504 });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE_RE.test(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // RSC payload fetches (client-side <Link> navigation): let them hit the
  // network untouched. When offline they fail fast and Next falls back to a
  // full document navigation, which `handleNavigation` serves from cache.
  if (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1") return;

  if (STATIC_ASSET_RE.test(url.pathname)) {
    event.respondWith(handleAsset(request));
  }
});

/**
 * When the browser regains connectivity it wakes the worker here; the open
 * tabs do the actual replay, since IndexedDB access and the session cookie
 * both live there.
 */
self.addEventListener("sync", (event) => {
  if (event.tag !== "bangre-sync") return;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) client.postMessage({ type: "bangre:flush-queue" });
    })()
  );
});
