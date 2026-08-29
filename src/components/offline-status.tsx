"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { listQueuedPayments, flushQueuedPayments } from "@/lib/offline-queue";

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

export function usePendingSyncCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const items = await listQueuedPayments();
    setCount(items.length);
  }, []);

  useEffect(() => {
    // Fetching-on-mount pattern (React docs: "Fetching data"); the queue
    // also lives in IndexedDB, not React state, so this is a subscription
    // to an external store rather than render-time state derivation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const handler = () => refresh();
    window.addEventListener("bangre:queue-changed", handler);
    return () => window.removeEventListener("bangre:queue-changed", handler);
  }, [refresh]);

  return count;
}

export function OfflineStatusCard() {
  const online = useOnlineStatus();
  const pending = usePendingSyncCount();

  useEffect(() => {
    if (online && pending > 0) {
      flushQueuedPayments();
    }
  }, [online, pending]);

  return (
    <div className="border border-(--color-border) bg-white rounded-xl p-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <span
          className="w-2 h-2 rounded-full"
          style={{
            background: online ? "var(--color-success-text)" : "var(--color-gold-dot)",
            boxShadow: online ? "0 0 0 3px var(--color-success-bg)" : "0 0 0 3px var(--color-gold-ring)",
          }}
        />
        {online ? "En ligne" : "Hors ligne"}
      </div>
      <div className="text-xs text-(--color-text-muted) mt-1.5 leading-snug">
        {pending > 0
          ? `${pending} modification${pending > 1 ? "s" : ""} enregistrée${pending > 1 ? "s" : ""} sur cet ordinateur.`
          : "Toutes les données sont synchronisées."}
      </div>
      {pending > 0 && (
        <button
          onClick={() => flushQueuedPayments()}
          disabled={!online}
          className="h-[34px] w-full rounded-lg border border-(--color-border-strong) flex items-center justify-center text-[12.5px] font-semibold mt-2.5 cursor-pointer bg-(--color-bg-subtle) disabled:opacity-50"
        >
          Synchroniser
        </button>
      )}
    </div>
  );
}
