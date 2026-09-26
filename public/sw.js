/* Bangre offline shell. Bump CACHE_VERSION to invalidate everything. */
const CACHE_VERSION = "v7";
const PAGES_CACHE = `bangre-pages-${CACHE_VERSION}`;
const ASSETS_CACHE = `bangre-assets-${CACHE_VERSION}`;

/**
 * The offline application. It renders any screen from the copy of the school
 * kept in IndexedDB, so it is served for every app page asked for without a
 * network — including pages this device has never opened.
 */
const SHELL_URL = "/hors-ligne";

/** Files outside `/_next/static` the offline app shows: the logo and the app icons. */
const EXTRA_ASSETS = ["/logo-bangre.jpg", "/icon-192.png", "/icon-512.png", "/icon.svg", "/manifest.webmanifest"];

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
 */
const STATIC_REF_RE = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[A-Za-z0-9_\-.~%/]+?\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|ico)/g;

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
              if (!url.startsWith("/_next/static/media/")) failed.push(url);
            }
          })
      );
      queue = next;
    }

    // Required = the shell's own scripts and stylesheets, and the logo.
    const required = [...staticRefs(html)].filter((u) => /\.(?:js|css)$/.test(u)).concat("/logo-bangre.jpg");
    const missing = required.filter((u) => failed.includes(u));
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
 * Network-first for pages: the secretary must see live figures whenever there
 * is a connection. Without one, the offline app answers for every page of the
 * app — never an old copy of a server page, whose data is stale and whose
 * scripts may no longer exist.
 */
async function handleNavigation(request) {
  const url = new URL(request.url);
  const network = fetch(request);
  network.catch(() => {});

  try {
    return await withTimeout(network, NAVIGATION_TIMEOUT_MS);
  } catch {
    const cache = await caches.open(PAGES_CACHE);
    const shell = await cache.match(SHELL_URL);
    if (shell && !AUTH_PAGES_RE.test(url.pathname)) return shell;

    return new Response(
      "<!doctype html><meta charset=utf-8><title>Bangre — hors ligne</title>" +
        "<body style=\"font-family:system-ui;padding:40px;color:#333\"><h2>Pas de connexion</h2>" +
        "<p>Cette page a besoin d'internet. Si Bangre a déjà été ouvert sur cet appareil, " +
        "<a href=\"/tableau-de-bord\">ouvrez le tableau de bord</a> : il fonctionne hors ligne.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

/**
 * Next's in-app navigations fetch the next screen's data (RSC). On a wifi with
 * no internet those requests hang instead of failing; cut them short so Next
 * falls back to a normal page load, which the offline app then answers.
 */
async function handleRsc(request) {
  try {
    return await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
  } catch {
    return Response.error();
  }
}

/** Assets are immutable in practice: serve from cache, refresh in the background. */
async function handleAsset(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const url = new URL(request.url);
  // The same file is cached under its bare path by `prepareOffline`.
  const cached = (await cache.match(request)) || (await cache.match(url.pathname));
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

  if (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1") {
    event.respondWith(handleRsc(request));
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
