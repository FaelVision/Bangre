"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function runsInstalled() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Asks the browser to keep this site's storage — the copy of the school and
 * the outbox of unsent work — instead of clearing it when the disk runs low.
 * Chrome and Edge grant it to an installed app; elsewhere it is best effort.
 */
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * "Installer Bangré sur cet ordinateur". Once installed, Bangré opens from its
 * own icon like any program — after a restart, with no network — straight into
 * the data kept on the device. Only shown when the browser offers installation
 * and the app is not already running installed.
 */
export function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstalled(runsInstalled());
    void requestPersistentStorage();

    const onPrompt = (event: Event) => {
      // Keep the browser's own mini-bar out of the way: the sidebar offers it.
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      void requestPersistentStorage();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !prompt) return null;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setInstalled(true);
    setPrompt(null);
  }

  return (
    <div className="border border-(--color-success-border) bg-(--color-success-bg-soft) rounded-xl p-3 mb-2">
      <div className="text-[13px] font-semibold text-(--color-success-text-dark)">Installer Bangré</div>
      <div className="text-xs text-(--color-text-muted) mt-1 leading-snug">
        Une icône sur cet ordinateur : Bangré s&apos;ouvre et fonctionne même sans connexion, y compris après un
        redémarrage.
      </div>
      <button
        type="button"
        onClick={() => void install()}
        className="h-[34px] w-full rounded-lg bg-(--color-primary) text-white text-[12.5px] font-semibold mt-2.5 cursor-pointer"
      >
        Installer l&apos;application
      </button>
    </div>
  );
}
