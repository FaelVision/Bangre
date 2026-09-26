"use client";

import { useEffect } from "react";
import { ensureOfflineReady } from "@/lib/offline-ready";

/**
 * Registers the service worker and, as soon as the user is signed in with a
 * connection, downloads everything this device needs to keep working with no
 * network: the application's files and the school's data.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support degrades gracefully if registration fails.
    });

    ensureOfflineReady();
    const onOnline = () => ensureOfflineReady();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);
  return null;
}
