"use client";

/**
 * Whether the server can actually be reached — the question every offline
 * decision in the app depends on.
 *
 * `navigator.onLine` alone is not enough: it is true as soon as a network
 * interface is up, including a wifi with no internet behind it or a phone with
 * no data credit. There, requests do not fail — they hang. Relying on it, the
 * app kept calling the server and waited: 12 s per click, a payment window that
 * never loaded. So the app also watches its own requests: one that fails or
 * takes too long marks the server unreachable, and from then on everything goes
 * straight to the copy on the device, while a light probe (`/api/ping`) waits
 * for the server to answer again.
 */

export const CONNECTIVITY_CHANGED = "bangre:connectivity-changed";

const PROBE_TIMEOUT_MS = 5000;
const PROBE_INTERVAL_MS = 15000;

let reachable = true;
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probing: Promise<boolean> | null = null;
let started = false;

function browserOnline() {
  return typeof navigator === "undefined" || navigator.onLine;
}

/** True when the app should not even try the server. */
export function isOffline() {
  return !browserOnline() || !reachable;
}

function tellServiceWorker() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "bangre:reachability", reachable });
  } catch {
    /* no worker: nothing to tell */
  }
}

function setReachable(next: boolean) {
  if (next === reachable) return;
  reachable = next;
  tellServiceWorker();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CONNECTIVITY_CHANGED));
  if (!next) scheduleProbe();
}

function scheduleProbe(delay = PROBE_INTERVAL_MS) {
  if (typeof window === "undefined" || probeTimer) return;
  probeTimer = setTimeout(() => {
    probeTimer = null;
    void probe().then((ok) => {
      if (!ok) scheduleProbe();
    });
  }, delay);
}

/** Asks the server whether it is there. Concurrent calls share one request. */
export function probe(): Promise<boolean> {
  if (probing) return probing;
  if (!browserOnline()) return Promise.resolve(false);
  probing = (async () => {
    try {
      const res = await fetch("/api/ping", {
        cache: "no-store",
        credentials: "same-origin",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      // Any answer, even an error status, means the server is there.
      const ok = res.status > 0;
      setReachable(ok);
      return ok;
    } catch {
      setReachable(false);
      return false;
    } finally {
      probing = null;
    }
  })();
  return probing;
}

/** A request just failed or hung: stop waiting on the server. */
export function reportUnreachable() {
  setReachable(false);
}

/** A request just went through. */
export function reportReachable() {
  setReachable(true);
}

/**
 * The offline app is only shown when a page could not be loaded: it starts
 * from "unreachable" and lets the probe say otherwise.
 */
export function assumeUnreachable() {
  if (!reachable) return;
  reachable = false;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CONNECTIVITY_CHANGED));
  void probe().then((ok) => {
    if (!ok) scheduleProbe();
  });
}

/** Browser events that should trigger a fresh look at the server. */
export function startConnectivityWatch() {
  if (started || typeof window === "undefined") return;
  started = true;
  const recheck = () => {
    if (!browserOnline()) {
      window.dispatchEvent(new CustomEvent(CONNECTIVITY_CHANGED));
      return;
    }
    void probe();
  };
  window.addEventListener("online", recheck);
  window.addEventListener("offline", () => window.dispatchEvent(new CustomEvent(CONNECTIVITY_CHANGED)));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !reachable) void probe();
  });
  // A worker installed after this page loaded starts out not knowing.
  navigator.serviceWorker?.addEventListener?.("controllerchange", tellServiceWorker);
}

export function subscribeToConnectivity(callback: () => void) {
  startConnectivityWatch();
  window.addEventListener(CONNECTIVITY_CHANGED, callback);
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener(CONNECTIVITY_CHANGED, callback);
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Thrown instead of waiting on a server that is not there. */
export class OfflineError extends Error {
  constructor() {
    super("Pas de connexion au serveur.");
    this.name = "OfflineError";
  }
}

/**
 * A successful server action may navigate by throwing a redirect signal: it is
 * the server's answer, not a network failure, and must pass through untouched.
 */
function isServerAnswer(err: unknown) {
  return typeof (err as { digest?: unknown })?.digest === "string";
}

/** Errors that mean "the request never got an answer", whatever the browser. */
export function isNetworkError(err: unknown) {
  if (err instanceof OfflineError) return true;
  if (isServerAnswer(err)) return false;
  const e = err as { name?: string; message?: string } | null;
  const text = `${e?.name ?? ""} ${e?.message ?? ""}`;
  return /Failed to fetch|fetch failed|NetworkError|Load failed|Network request failed|Connection closed|ChunkLoadError|Loading chunk|Failed to load|TimeoutError|AbortError|ERR_INTERNET|ERR_NETWORK|ERR_CONNECTION/i.test(
    text
  );
}

/**
 * Runs a call to the server, but never waits on it for longer than `timeoutMs`
 * and never tries it at all when the server is known to be out of reach. Throws
 * `OfflineError` in both cases, so callers have one thing to catch before
 * falling back to the device.
 */
export async function withNetwork<T>(run: () => Promise<T>, timeoutMs = 10000): Promise<T> {
  if (isOffline()) throw new OfflineError();

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OfflineError()), timeoutMs);
  });

  try {
    const value = await Promise.race([run(), timeout]);
    reportReachable();
    return value;
  } catch (err) {
    if (isServerAnswer(err)) {
      reportReachable();
      throw err;
    }
    if (isNetworkError(err)) {
      reportUnreachable();
      throw err instanceof OfflineError ? err : new OfflineError();
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
