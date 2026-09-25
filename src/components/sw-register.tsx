"use client";

import { useEffect } from "react";

const SHELL_REFRESHED_KEY = "bangre:shell-refreshed";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support degrades gracefully if registration fails.
    });

    /**
     * A new deployment changes the offline shell and its asset hashes without
     * changing sw.js, so nothing would re-install. Ask the worker to re-take
     * the shell once per browser session: cheap, and it keeps the offline copy
     * of the app in step with the deployed one.
     */
    void navigator.serviceWorker.ready.then((registration) => {
      try {
        if (sessionStorage.getItem(SHELL_REFRESHED_KEY)) return;
        sessionStorage.setItem(SHELL_REFRESHED_KEY, "1");
      } catch {
        // Private mode without storage: refreshing every load is still fine.
      }
      registration.active?.postMessage("bangre:refresh-shell");
    });
  }, []);
  return null;
}
