/* Bangré offline shell. Bump CACHE_VERSION to invalidate everything. */
const CACHE_VERSION = "v11";
const PAGES_CACHE = `bangre-pages-${CACHE_VERSION}`;
const ASSETS_CACHE = `bangre-assets-${CACHE_VERSION}`;

/**
 * The offline application. It renders any screen from the copy of the school
 * kept in IndexedDB, so it is served for every app page asked for without a
 * network — including pages this device has never opened.
 */
const SHELL_URL = "/hors-ligne";

/** Files outside `/_next/static` the offline app shows: the logo and the app icons. */
const EXTRA_ASSETS = [
  "/logo-bangre-carre.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/manifest.webmanifest",
];

const STATIC_ASSET_RE = /\.(?:js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/;
// Never serve a stale answer for these — money, sessions and admin actions.
const NEVER_CACHE_RE = /^\/(api|admin)(\/|$)/;
// Screens that only exist for signed-out visitors: the offline app has nothing to show there.
const AUTH_PAGES_RE = /^\/(connexion|inscription|mot-de-passe-oublie|reinitialiser-mot-de-passe)(\/|$)/;

/**
 * Every `/_next/static/…` file a document or a script mentions. Next lists the
 * scripts of the page in `<script src>`, but the client components are loaded
 * at hydration from paths written inside the page's data (escaped JSON), and
 * the runtime itself names further chunks — reading only `src="…"` missed
 * those, and the screens relying on them broke offline.
 *
 * On Vercel the files live one level deeper, under `static/immutable/…`
 * (locally: `static/chunks/…`). Matching only the local layout found nothing
 * at all in production: the offline app was cached without its scripts and
 * stayed on "Chargement…" forever — while the sidebar said it was ready.
 */
const STATIC_REF_RE = /(?:\/_next\/)?static\/(?:[A-Za-z0-9_-]+\/)?(?:chunks|css|media)\/[A-Za-z0-9_\-.~%/]+?\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|ico)/g;

function staticRefs(text) {
  const out = new Set();
  for (const match of text.matchAll(STATIC_REF_RE)) {
    const ref = match[0];
    out.add(ref.startsWith("/_next/") ? ref : `/_next/${ref}`);
  }
  return out;
}

async function fetchAndCache(cache, url) {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-cache" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await cache.put(url, res.clone());
  return res;
}

let preparing = null;

/**
 * Downloads everything the offline app needs to start and run with no
 * server: the shell document, every script, stylesheet and font it uses —
 * followed transitively through the files themselves — the logo and icons.
 * Returns what was stored and what failed, so the app can tell the user
 * whether this device is really ready to work offline.
 */
function prepareOffline() {
  if (preparing) return preparing;
  preparing = (async () => {
    const pages = await caches.open(PAGES_CACHE);
    const assets = await caches.open(ASSETS_CACHE);
    const failed = [];

    let html;
    try {
      const res = await fetch(SHELL_URL, { credentials: "same-origin", cache: "no-cache" });
      // A redirect means the server answered something else (a login page);
      // caching it under /hors-ligne would poison the offline entry point.
      if (!res.ok || res.redirected) return { ok: false, cached: 0, failed: [SHELL_URL] };
      html = await res.clone().text();
      await pages.put(SHELL_URL, res);
    } catch {
      return { ok: false, cached: 0, failed: [SHELL_URL] }; // no network right now
    }

    const seen = new Set();
    let queue = [...staticRefs(html), ...EXTRA_ASSETS];
    let cached = 0;

    // Breadth-first through the files: a script names the chunks it loads, a
    // stylesheet the fonts it uses. Bounded, in case a pattern ever loops.
    for (let round = 0; round < 6 && queue.length > 0; round++) {
      const next = [];
      await Promise.all(
        queue
          .filter((url) => !seen.has(url) && seen.add(url))
          .map(async (url) => {
            try {
              const res = await fetchAndCache(assets, url);
              cached += 1;
              if (/\.(?:js|css)$/.test(url)) {
                for (const ref of staticRefs(await res.text())) if (!seen.has(ref)) next.push(ref);
              }
            } catch {
              // A chunk named in a comment or a stale path can 404: only the
              // files the shell itself lists are required.
              if (!/^\/_next\/static\/(?:[A-Za-z0-9_-]+\/)?media\//.test(url)) failed.push(url);
            }
          })
      );
      queue = next;
    }

    // Required = the shell's own scripts and stylesheets, and the logo.
    const required = [...staticRefs(html)].filter((u) => /\.(?:js|css)$/.test(u)).concat("/logo-bangre-carre.png");
    const missing = required.filter((u) => failed.includes(u));
    // A shell with no script found in it cannot be the real one (or the pattern
    // above no longer matches how Next names its files): never call that ready.
    const scripts = required.filter((u) => u.endsWith(".js"));
    if (scripts.length === 0) return { ok: false, cached, failed: ["scripts de l'application introuvables"] };
    return { ok: missing.length === 0, cached, failed: missing };
  })().finally(() => {
    preparing = null;
  });
  return preparing;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await prepareOffline();
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
  // The page learned it first (a form that hung, a probe that answered).
  if (event.data?.type === "bangre:reachability") {
    if (event.data.reachable) markReachable();
    else markUnreachable();
  }
  // The app asks for the full download after signing in and on each visit;
  // the answer goes back on the port it sent, if any.
  if (event.data === "bangre:refresh-shell" || event.data?.type === "bangre:prepare-offline") {
    const port = event.ports?.[0];
    event.waitUntil(
      prepareOffline().then(
        (result) => port?.postMessage(result),
        () => port?.postMessage({ ok: false, cached: 0, failed: ["?"] })
      )
    );
  }
});

/**
 * How long a request may take before the device copy takes over. A school wifi
 * that is up with no internet behind it does not fail a request — it lets it
 * hang for a minute or more.
 */
const NAVIGATION_TIMEOUT_MS = 6000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

/**
 * Once a request has failed, the next ones would fail the same way — after
 * the same wait. So the worker remembers: while the server is known to be out
 * of reach, pages come straight from the device (no 6 s wait per click, which
 * used to be 12 s: the data request, then the page), and a light probe in the
 * background notices when the server answers again.
 */
const UNREACHABLE_MAX_MS = 2 * 60 * 1000;
const PROBE_TIMEOUT_MS = 5000;
let unreachableSince = 0;
let probing = null;

function markUnreachable() {
  if (!unreachableSince) unreachableSince = Date.now();
}

function markReachable() {
  unreachableSince = 0;
}

function knownUnreachable() {
  if (!unreachableSince) return false;
  // Never trust an old verdict for long: past this, try the network again.
  if (Date.now() - unreachableSince > UNREACHABLE_MAX_MS) {
    unreachableSince = 0;
    return false;
  }
  return true;
}

function probeServer() {
  if (probing) return probing;
  probing = withTimeout(fetch("/api/ping", { cache: "no-store" }), PROBE_TIMEOUT_MS)
    .then(
      () => markReachable(),
      () => {
        unreachableSince = Date.now(); // still down: keep the verdict fresh
      }
    )
    .finally(() => {
      probing = null;
    });
  return probing;
}

async function offlineShell(url) {
  const cache = await caches.open(PAGES_CACHE);
  const shell = await cache.match(SHELL_URL);
  if (shell && !AUTH_PAGES_RE.test(url.pathname)) return shell;

  return new Response(
    "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\">" +
      "<title>Bangré — hors ligne</title>" +
      "<body style=\"font-family:system-ui;padding:40px;color:#333\"><h2>Pas de connexion</h2>" +
      "<p>Cette page a besoin d'internet. Si Bangré a déjà été ouvert sur cet appareil, " +
      "<a href=\"/tableau-de-bord\">ouvrez le tableau de bord</a> : il fonctionne hors ligne.</p>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

/**
 * Network-first for pages: the secretary must see live figures whenever there
 * is a connection. Without one, the offline app answers for every page of the
 * app — never an old copy of a server page, whose data is stale and whose
 * scripts may no longer exist.
 */
async function handleNavigation(event) {
  const { request } = event;
  const url = new URL(request.url);

  if (knownUnreachable() && !AUTH_PAGES_RE.test(url.pathname)) {
    event.waitUntil(probeServer());
    return offlineShell(url);
  }

  const network = fetch(request);
  network.catch(() => {});

  try {
    const res = await withTimeout(network, NAVIGATION_TIMEOUT_MS);
    markReachable();
    return res;
  } catch {
    markUnreachable();
    return offlineShell(url);
  }
}

/**
 * Next's in-app navigations fetch the next screen's data (RSC). On a wifi with
 * no internet those requests hang instead of failing; cut them short so Next
 * falls back to a normal page load, which the offline app then answers.
 */
async function handleRsc(event) {
  const { request } = event;
  // Prefetches are guesses about the next click: never let them decide that
  // the server is gone, and never spend anything on them once it is.
  const prefetch = request.headers.get("Next-Router-Prefetch") === "1";

  if (knownUnreachable()) {
    if (!prefetch) event.waitUntil(probeServer());
    return Response.error();
  }

  try {
    const res = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
    markReachable();
    return res;
  } catch {
    if (!prefetch) markUnreachable();
    return Response.error();
  }
}

/** Assets are immutable in practice: serve from cache, refresh in the background. */
async function handleAsset(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const url = new URL(request.url);
  // The same file is cached under its bare path by `prepareOffline`.
  const cached = (await cache.match(request)) || (await cache.match(url.pathname));

  // Nothing to refresh against while the server is out of reach — and a
  // request left hanging there would hold up the page that asked for it.
  if (knownUnreachable()) return cached || new Response("", { status: 504 });

  const network = withTimeout(fetch(request), 15000)
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
    event.respondWith(handleNavigation(event));
    return;
  }

  if (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1") {
    event.respondWith(handleRsc(event));
    return;
  }

  if (
    STATIC_ASSET_RE.test(url.pathname) ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
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
