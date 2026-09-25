/* Bangre offline shell. Bump CACHE_VERSION to invalidate everything. */
const CACHE_VERSION = "v5";
const PAGES_CACHE = `bangre-pages-${CACHE_VERSION}`;
const ASSETS_CACHE = `bangre-assets-${CACHE_VERSION}`;

/**
 * The offline application. It renders any screen from the copy of the school
 * kept in IndexedDB, so it is served for pages this device has never opened —
 * that is what makes the whole app usable without a network, not just the
 * pages already visited.
 */
const SHELL_URL = "/hors-ligne";

/** Screens the shell knows how to draw from local data. */
const SHELL_ROUTES = [
  /^\/$/,
  /^\/hors-ligne$/,
  /^\/tableau-de-bord$/,
  /^\/classes$/,
  /^\/classes\/[^/]+\/eleves$/,
  /^\/eleves$/,
  /^\/eleves\/nouveau$/,
  /^\/eleves\/[^/]+$/,
  /^\/eleves\/[^/]+\/modifier$/,
  /^\/retards$/,
  /^\/paiements$/,
];

const STATIC_ASSET_RE = /\.(?:js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/;
// Never serve a stale answer for these — money, sessions and admin actions.
const NEVER_CACHE_RE = /^\/(api|admin|connexion|inscription)(\/|$)/;

function isShellRoute(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return SHELL_ROUTES.some((re) => re.test(path));
}

/**
 * Downloads the shell and everything it needs to boot with no server: its
 * scripts and stylesheets, and the fonts those stylesheets point at. Without
 * this the document would come out of the cache and then sit there, unable to
 * fetch its own JavaScript.
 */
async function precacheShell() {
  const pages = await caches.open(PAGES_CACHE);
  const assets = await caches.open(ASSETS_CACHE);

  let html;
  try {
    const res = await fetch(SHELL_URL, { credentials: "same-origin", cache: "no-cache" });
    // A redirect means the server answered something else (a login page);
    // caching it under /hors-ligne would poison the offline entry point.
    if (!res.ok || res.redirected) return;
    html = await res.clone().text();
    await pages.put(SHELL_URL, res);
  } catch {
    return; // no network at install time; the next activation tries again
  }

  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) {
    urls.add(match[1].replace(/&amp;/g, "&"));
  }

  // Fonts are referenced from inside the stylesheets, never from the HTML, so
  // the stylesheets are read as they are cached and their urls collected.
  const fonts = new Set();
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) return;
        if (url.endsWith(".css")) {
          const css = await res.clone().text();
          for (const match of css.matchAll(/url\((\/_next\/static\/media\/[^)"']+)\)/g)) {
            fonts.add(match[1]);
          }
        }
        await assets.put(url, res);
      } catch {
        /* one missing asset must not abort the whole install */
      }
    })
  );

  await Promise.all(
    [...fonts].map(async (url) => {
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (res.ok) await assets.put(url, res);
      } catch {
        /* ignore */
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await precacheShell();
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
      // A new deployment ships new asset hashes: re-take the shell so the
      // offline copy matches what is now served.
      await precacheShell();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
  if (event.data === "bangre:refresh-shell") event.waitUntil(precacheShell());
});

/**
 * Network-first for pages: the secretary must see live figures whenever there
 * is a connection. Without one, the offline shell takes over for every screen
 * it can draw from the device copy, and the last good HTML is the fallback for
 * the rest (class configuration, import, passage d'année…).
 */
async function handleNavigation(request) {
  const cache = await caches.open(PAGES_CACHE);
  const url = new URL(request.url);

  try {
    const res = await fetch(request);
    // A redirect means "sign in again" — caching it under the requested URL
    // would serve the login page for the dashboard once offline.
    if (res.ok && !res.redirected) cache.put(request, res.clone());
    return res;
  } catch {
    const shell = await cache.match(SHELL_URL);
    if (shell && isShellRoute(url.pathname)) return shell;

    const cached = (await cache.match(request)) || (await cache.match(url.pathname));
    if (cached) return cached;
    if (shell) return shell;

    return new Response("Hors ligne", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
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
  // full document navigation, which `handleNavigation` answers with the shell.
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
