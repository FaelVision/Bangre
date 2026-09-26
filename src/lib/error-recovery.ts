"use client";

import { isNetworkError, isOffline, reportUnreachable } from "@/lib/connectivity";

const RELOAD_KEY = "bangre:network-error-reload";
/** One automatic reload per this window: a second failure is shown, not looped on. */
const RELOAD_WINDOW_MS = 20_000;

/** Whether an error only means "the server could not be reached". */
export function isConnectivityError(error: unknown) {
  return isOffline() || isNetworkError(error);
}

/**
 * A screen that broke because the network went — a page's data cut off
 * mid-way, a script that could not load, a server call that failed — is not a
 * bug to show the secretary: reloading the same address lands in the offline
 * app, which renders it from the device. False when that was already tried a
 * moment ago: the caller then shows its message instead of looping.
 */
export function canReloadIntoOfflineApp(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    return Date.now() - last >= RELOAD_WINDOW_MS;
  } catch {
    return true; // no storage: the browser itself stops a real reload loop
  }
}

export function reloadIntoOfflineApp() {
  reportUnreachable();
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  window.location.reload();
}

/** Sends a crash to the admin error log. Fire-and-forget. */
export function reportClientError(error: Error & { digest?: string }) {
  fetch("/api/errors/client", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: error.message || "Erreur inconnue",
      stack: error.stack,
      digest: error.digest,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    }),
    keepalive: true,
  }).catch(() => {});
}
