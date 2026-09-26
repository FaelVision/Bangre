"use client";

import { refreshSnapshot } from "@/lib/offline-mirror";
import { isOffline } from "@/lib/connectivity";
import { requestPersistentStorage } from "@/components/install-app";

/**
 * Makes this device ready to work with no network: the application's files
 * (downloaded by the service worker) and the school's data (the local copy),
 * both at once, as soon as the user is signed in with a connection.
 *
 * The outcome is remembered so the sidebar can say plainly whether the device
 * is ready — "prêt hors ligne" is a promise the secretary relies on before
 * the power or the network goes.
 */

export type OfflineReadiness = {
  state: "unknown" | "preparing" | "ready" | "incomplete";
  /** When the last complete preparation finished. */
  readyAt: number | null;
  detail?: string;
};

const STORAGE_KEY = "bangre:offline-readiness";
const SESSION_KEY = "bangre:offline-prepared";
export const READINESS_CHANGED = "bangre:readiness-changed";

let current: OfflineReadiness = { state: "unknown", readyAt: null };

function load(): OfflineReadiness {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as OfflineReadiness;
      // A preparation interrupted by closing the tab is not a result.
      return saved.state === "preparing" ? { ...saved, state: saved.readyAt ? "ready" : "unknown" } : saved;
    }
  } catch {
    /* storage unavailable: nothing remembered */
  }
  return { state: "unknown", readyAt: null };
}

function set(next: OfflineReadiness) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(READINESS_CHANGED));
}

export function getReadiness(): OfflineReadiness {
  if (current.state === "unknown" && typeof window !== "undefined") current = load();
  return current;
}

type SwResult = { ok: boolean; cached: number; failed: string[] };

async function askServiceWorker(): Promise<SwResult> {
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker) return { ok: false, cached: 0, failed: ["service worker"] };

  return new Promise<SwResult>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve({ ok: false, cached: 0, failed: ["délai dépassé"] }), 180_000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data as SwResult);
    };
    worker.postMessage({ type: "bangre:prepare-offline" }, [channel.port2]);
  });
}

let running: Promise<OfflineReadiness> | null = null;

/** Downloads the application and the school's data for offline use. */
export function prepareOfflineDevice(): Promise<OfflineReadiness> {
  if (running) return running;
  running = (async () => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      const result: OfflineReadiness = {
        state: "incomplete",
        readyAt: null,
        detail: "Ce navigateur ne permet pas le travail hors ligne.",
      };
      set(result);
      return result;
    }

    const previous = getReadiness();
    set({ ...previous, state: "preparing" });

    const [app, data] = await Promise.all([
      askServiceWorker().catch(() => ({ ok: false, cached: 0, failed: ["service worker"] }) as SwResult),
      refreshSnapshot(),
    ]);
    void requestPersistentStorage();

    const result: OfflineReadiness =
      app.ok && data.ok
        ? { state: "ready", readyAt: Date.now() }
        : {
            state: "incomplete",
            readyAt: previous.readyAt,
            detail: !app.ok
              ? "Des fichiers de l'application n'ont pas pu être téléchargés."
              : !data.ok && data.reason === "auth"
                ? "Session expirée : reconnectez-vous."
                : "Les données de l'école n'ont pas pu être téléchargées.",
          };
    set(result);
    try {
      if (result.state === "ready") sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Called on every app load: prepares the device once per browser session (a
 * new deployment brings new files), and again whenever the last attempt was
 * incomplete.
 */
export function ensureOfflineReady() {
  if (isOffline()) return;
  let done = false;
  try {
    done = sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    /* ignore */
  }
  if (done && getReadiness().state === "ready") return;
  void prepareOfflineDevice();
}

/** Signing out: the next sign-in, on this tab too, prepares the device again. */
export function forgetOfflinePreparation() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  // The school's data leaves the device with the session.
  set({ state: "unknown", readyAt: null });
}
