"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { listQueued, flushQueue, QUEUE_CHANGED, type QueuedEntry } from "@/lib/offline-queue";

function subscribeToConnectivity(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnlineStatus() {
  return useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    () => true // server snapshot: assume online until hydrated
  );
}

export function usePendingQueue() {
  const [items, setItems] = useState<QueuedEntry[]>([]);

  const refresh = useCallback(async () => {
    setItems(await listQueued());
  }, []);

  useEffect(() => {
    // Fetching-on-mount pattern (React docs: "Fetching data"); the queue lives
    // in IndexedDB, not React state, so this is a subscription to an external
    // store rather than render-time state derivation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const handler = () => refresh();
    window.addEventListener(QUEUE_CHANGED, handler);
    return () => window.removeEventListener(QUEUE_CHANGED, handler);
  }, [refresh]);

  return items;
}

export function OfflineStatusCard() {
  const online = useOnlineStatus();
  const items = usePendingQueue();
  const router = useRouter();

  const [syncing, setSyncing] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const sync = useCallback(
    async (silent: boolean) => {
      if (syncing) return;
      setSyncing(true);
      try {
        const res = await flushQueue();
        if (res.synced > 0) {
          setReport(`${res.synced} enregistrement(s) synchronisé(s).`);
          router.refresh();
        } else if (res.errors.length) {
          setReport(res.errors[0]);
        } else if (!silent) {
          setReport("Rien à synchroniser.");
        }
      } finally {
        setSyncing(false);
      }
    },
    [syncing, router]
  );

  // Reconnection, and the service worker's Background Sync wake-up, both flush.
  // This synchronises with an external system (the server and IndexedDB); the
  // state it sets is the report of that exchange, not derived render data.
  useEffect(() => {
    if (online && items.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void sync(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, items.length]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "bangre:flush-queue") void sync(true);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [sync]);

  useEffect(() => {
    if (!report) return;
    const t = setTimeout(() => setReport(null), 6000);
    return () => clearTimeout(t);
  }, [report]);

  const pending = items.length;

  return (
    <div
      className="border rounded-xl p-3"
      style={{
        background: online ? "var(--color-bg-card)" : "var(--color-gold-bg)",
        borderColor: online ? "var(--color-border)" : "var(--color-gold-border)",
      }}
    >
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            background: online ? "var(--color-success-text)" : "var(--color-gold-dot)",
            boxShadow: online ? "0 0 0 3px var(--color-success-bg)" : "0 0 0 3px var(--color-gold-ring)",
          }}
        />
        {online ? "En ligne" : "Hors ligne"}
        {pending > 0 && (
          <span className="ml-auto text-[11.5px] font-semibold px-1.5 py-0.5 rounded-full bg-(--color-gold-chip-bg) text-(--color-gold-text) tabular-nums">
            {pending}
          </span>
        )}
      </div>

      <div className="text-xs text-(--color-text-muted) mt-1.5 leading-snug">
        {pending > 0
          ? `${pending} enregistrement${pending > 1 ? "s" : ""} en attente sur cet appareil.`
          : online
            ? "Toutes les données sont synchronisées."
            : "Vous pouvez continuer à travailler : tout sera envoyé au retour du réseau."}
      </div>

      {pending > 0 && (
        <div className="grid gap-1 mt-2 max-h-[104px] overflow-y-auto">
          {items.slice(0, 6).map((item) => (
            <div key={item.id} className="text-[11.5px] text-(--color-text-secondary) truncate" title={item.label}>
              · {item.label}
              {item.lastError && <span className="text-(--color-danger-text)"> — {item.lastError}</span>}
            </div>
          ))}
          {pending > 6 && <div className="text-[11.5px] text-(--color-text-muted)">et {pending - 6} autre(s)…</div>}
        </div>
      )}

      {pending > 0 && (
        <button
          onClick={() => void sync(false)}
          disabled={!online || syncing}
          className="h-[34px] w-full rounded-lg border border-(--color-border-strong) flex items-center justify-center text-[12.5px] font-semibold mt-2.5 cursor-pointer bg-(--color-bg-subtle) disabled:opacity-50"
        >
          {syncing ? "Synchronisation…" : online ? "Synchroniser maintenant" : "En attente de réseau"}
        </button>
      )}

      {report && <div className="text-[11.5px] text-(--color-text-secondary) mt-2 leading-snug">{report}</div>}
    </div>
  );
}
