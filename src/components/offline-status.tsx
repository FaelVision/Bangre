"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { currentSchoolId, listQueued, removeQueued, QUEUE_CHANGED, type QueuedEntry } from "@/lib/offline-queue";
import { MIRROR_CHANGED, refreshIfStale, snapshotAge, syncAll } from "@/lib/offline-mirror";
import {
  getReadiness,
  prepareOfflineDevice,
  READINESS_CHANGED,
  type OfflineReadiness,
} from "@/lib/offline-ready";

const UNKNOWN_READINESS: OfflineReadiness = { state: "unknown", readyAt: null };

function subscribeToReadiness(callback: () => void) {
  window.addEventListener(READINESS_CHANGED, callback);
  return () => window.removeEventListener(READINESS_CHANGED, callback);
}

/** Whether this device holds everything needed to work with no network. */
export function useOfflineReadiness() {
  return useSyncExternalStore(subscribeToReadiness, getReadiness, () => UNKNOWN_READINESS);
}

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

export type OutboxState = {
  /** Waiting to reach the server. */
  pending: QueuedEntry[];
  /** Refused by the server for good — kept until the user has read why. */
  rejected: QueuedEntry[];
  /** Typed for another school signed in on this device earlier. */
  otherSchool: QueuedEntry[];
};

export function usePendingQueue(): OutboxState {
  const [state, setState] = useState<OutboxState>({ pending: [], rejected: [], otherSchool: [] });

  const refresh = useCallback(async () => {
    const [all, schoolId] = await Promise.all([listQueued(), currentSchoolId()]);
    const next: OutboxState = { pending: [], rejected: [], otherSchool: [] };
    for (const entry of all) {
      if (entry.rejectedAt) next.rejected.push(entry);
      else if (schoolId && entry.schoolId && entry.schoolId !== schoolId) next.otherSchool.push(entry);
      else next.pending.push(entry);
    }
    setState(next);
  }, []);

  useEffect(() => {
    // Fetching-on-mount pattern (React docs: "Fetching data"); the queue lives
    // in IndexedDB, not React state, so this is a subscription to an external
    // store rather than render-time state derivation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const handler = () => refresh();
    window.addEventListener(QUEUE_CHANGED, handler);
    // Signing into another school replaces the copy, which changes whose entries are whose.
    window.addEventListener(MIRROR_CHANGED, handler);
    return () => {
      window.removeEventListener(QUEUE_CHANGED, handler);
      window.removeEventListener(MIRROR_CHANGED, handler);
    };
  }, [refresh]);

  return state;
}

/** How old the copy of the school on this device is, in minutes. */
function useSnapshotAge() {
  const [age, setAge] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    const read = async () => setAge(await snapshotAge());
    void read();
    const handler = () => void read();
    window.addEventListener(MIRROR_CHANGED, handler);
    // The age itself keeps changing even when nothing happens.
    const timer = setInterval(handler, 60_000);
    return () => {
      window.removeEventListener(MIRROR_CHANGED, handler);
      clearInterval(timer);
    };
  }, []);

  return age;
}

function ageLabel(ageMs: number) {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

/** Idle safety net: a long tick, so an app left open all day does not go stale. */
const PERIODIC_REFRESH_MS = 15 * 60 * 1000;

/**
 * Keeps the local copy current while the app is open: once at startup, at every
 * reconnection, when the tab comes back to the foreground, and on a slow timer.
 * Renders nothing — it is the part of the app that only talks to the network.
 */
export function OfflineSync() {
  const online = useOnlineStatus();

  useEffect(() => {
    if (!online) return;

    void refreshIfStale();

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshIfStale();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => {
      // Nothing to keep fresh for a tab nobody is looking at.
      if (document.visibilityState === "visible") void refreshIfStale(PERIODIC_REFRESH_MS);
    }, PERIODIC_REFRESH_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [online]);

  return null;
}

export function OfflineStatusCard() {
  const online = useOnlineStatus();
  const { pending: items, rejected, otherSchool } = usePendingQueue();
  const age = useSnapshotAge();
  const router = useRouter();

  const [syncing, setSyncing] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const sync = useCallback(
    async (silent: boolean) => {
      if (syncing) return;
      setSyncing(true);
      try {
        // Send what was captured offline, then pull the school back down so the
        // device sees the server's version of its own writes.
        const res = await syncAll();
        if (res.synced > 0) router.refresh();
        if (res.synced > 0 || res.errors.length) {
          // Both halves matter: what went through, and what did not.
          setReport(
            [
              res.synced > 0 ? `${res.synced} enregistrement(s) synchronisé(s).` : null,
              res.errors.length ? res.errors[0] : null,
              res.errors.length > 1 ? `(+${res.errors.length - 1} autre(s) problème(s))` : null,
            ]
              .filter(Boolean)
              .join(" ")
          );
        } else if (!silent) {
          setReport(res.refreshed ? "Données à jour sur cet appareil." : "Synchronisation impossible pour le moment.");
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

      <ReadinessLine online={online} />

      {/* The other half of working offline: what this device holds locally. */}
      <div className="text-[11.5px] text-(--color-text-muted) mt-1.5 leading-snug">
        {age === undefined
          ? null
          : age === null
            ? "Copie locale des données : pas encore téléchargée."
            : `Copie locale des données : ${ageLabel(age)}.`}
      </div>

      {rejected.length > 0 && (
        <div className="grid gap-1.5 mt-2 rounded-lg border border-(--color-danger-border) bg-(--color-danger-bg-soft) p-2">
          <div className="text-[11.5px] font-semibold text-(--color-danger-text)">
            Refusé{rejected.length > 1 ? "s" : ""} par le serveur — à ressaisir en ligne :
          </div>
          {rejected.map((item) => (
            <div key={item.id} className="flex items-start gap-1.5 text-[11.5px] text-(--color-text-secondary)">
              <span className="flex-1 min-w-0">
                · {item.label}
                {item.lastError && <span className="text-(--color-danger-text)"> — {item.lastError}</span>}
              </span>
              <button
                type="button"
                onClick={() => void removeQueued(item.id)}
                className="shrink-0 text-[11px] font-semibold text-(--color-primary) cursor-pointer"
              >
                J&apos;ai compris
              </button>
            </div>
          ))}
        </div>
      )}

      {otherSchool.length > 0 && (
        <div className="text-[11.5px] text-(--color-text-muted) mt-1.5 leading-snug">
          {otherSchool.length} saisie(s) d&apos;un autre établissement attendent sa prochaine connexion sur cet appareil.
        </div>
      )}

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

      <button
        onClick={() => void sync(false)}
        disabled={!online || syncing}
        className="h-[34px] w-full rounded-lg border border-(--color-border-strong) flex items-center justify-center text-[12.5px] font-semibold mt-2.5 cursor-pointer bg-(--color-bg-subtle) disabled:opacity-50"
      >
        {syncing
          ? "Synchronisation…"
          : !online
            ? "En attente de réseau"
            : pending > 0
              ? "Synchroniser maintenant"
              : "Mettre à jour les données"}
      </button>

      {report && <div className="text-[11.5px] text-(--color-text-secondary) mt-2 leading-snug">{report}</div>}
    </div>
  );
}

/**
 * "Prêt hors ligne" — the application's files and the school's data are both
 * on this device. Anything short of that is said, with a way to finish it.
 */
function ReadinessLine({ online }: { online: boolean }) {
  const readiness = useOfflineReadiness();

  if (readiness.state === "preparing") {
    return (
      <div className="text-[11.5px] text-(--color-text-secondary) mt-1.5 leading-snug">
        Préparation du mode hors ligne : téléchargement de l&apos;application et des données…
      </div>
    );
  }

  if (readiness.state === "ready") {
    return (
      <div className="text-[11.5px] font-semibold text-(--color-success-text) mt-1.5 leading-snug">
        ✓ Prêt à fonctionner hors ligne
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <div className="text-[11.5px] text-(--color-danger-text) leading-snug">
        {readiness.state === "incomplete"
          ? `Mode hors ligne incomplet. ${readiness.detail ?? ""}`
          : "Mode hors ligne pas encore préparé sur cet appareil."}
      </div>
      {online && (
        <button
          type="button"
          onClick={() => void prepareOfflineDevice()}
          className="text-[11.5px] font-semibold text-(--color-primary) mt-1 cursor-pointer"
        >
          Préparer maintenant
        </button>
      )}
    </div>
  );
}
