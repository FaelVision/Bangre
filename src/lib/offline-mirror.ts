"use client";

import { useCallback, useEffect, useState } from "react";
import { getDb, MIRROR_STORE } from "@/lib/offline-db";
import { applyPendingOperations, reviveSnapshot, type MirrorData } from "@/lib/offline-data";
import { flushQueue, listPending, QUEUE_CHANGED } from "@/lib/offline-queue";

/**
 * The local copy of the school, kept on the device.
 *
 * Downloaded whole from `/api/offline/snapshot` whenever there is a connection,
 * stored in IndexedDB, and read back by every screen when there is none. The
 * outbox is folded on top at read time (`applyPendingOperations`), so what the
 * user typed offline is part of what they see offline.
 */

const KEY = "current";
export const MIRROR_CHANGED = "bangre:mirror-changed";
/**
 * Below this age a page load or a return to the foreground leaves the copy
 * alone. A whole school is a real download on a phone connection, so it is
 * refreshed on events that matter (a write, a reconnection, a tab coming back)
 * rather than continuously.
 */
export const MIRROR_FRESH_MS = 5 * 60 * 1000;

type StoredSnapshot = { key: string; savedAt: number; snapshot: unknown };

/** Reviving dates over a whole school is not free — keep the last result. */
let revived: { savedAt: number; data: MirrorData } | null = null;

function notifyChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(MIRROR_CHANGED));
}

export async function saveSnapshot(snapshot: unknown) {
  const db = await getDb();
  if (!db) return;
  const savedAt = Date.now();
  await db.put(MIRROR_STORE, { key: KEY, savedAt, snapshot } as StoredSnapshot);
  revived = { savedAt, data: reviveSnapshot(snapshot) };
  notifyChanged();
}

/** The stored snapshot alone, without the pending outbox folded in. */
export async function loadSnapshot(): Promise<MirrorData | null> {
  const db = await getDb();
  if (!db) return null;
  const stored = (await db.get(MIRROR_STORE, KEY)) as StoredSnapshot | undefined;
  if (!stored) return null;
  if (revived && revived.savedAt === stored.savedAt) return revived.data;
  try {
    const data = reviveSnapshot(stored.snapshot);
    revived = { savedAt: stored.savedAt, data };
    return data;
  } catch {
    // A snapshot written by an older version of the app that no longer parses:
    // better no local copy than a broken one — the next refresh replaces it.
    return null;
  }
}

/** What the screens read: the snapshot plus everything still waiting in the outbox. */
export async function loadLocalData(): Promise<MirrorData | null> {
  const snapshot = await loadSnapshot();
  if (!snapshot) return null;
  return applyPendingOperations(snapshot, await listPending());
}

export async function snapshotAge(): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const stored = (await db.get(MIRROR_STORE, KEY)) as StoredSnapshot | undefined;
  return stored ? Date.now() - stored.savedAt : null;
}

/**
 * Drops the copy of the school. Called when the user signs out: a device left
 * at the counter must not keep showing the establishment data to whoever picks
 * it up next. The outbox is deliberately kept — unsent work belongs to the
 * school that typed it, and it goes out at the next sign-in.
 */
export async function clearMirror() {
  const db = await getDb();
  if (!db) return;
  await db.delete(MIRROR_STORE, KEY);
  revived = null;
  notifyChanged();
}

export type RefreshResult = { ok: true } | { ok: false; reason: "offline" | "auth" | "error" };

let refreshing: Promise<RefreshResult> | null = null;

/**
 * Re-downloads the whole school. Concurrent calls share one request — the
 * status card, the reconnection handler and the page load all ask for it.
 */
export function refreshSnapshot(): Promise<RefreshResult> {
  if (refreshing) return refreshing;

  refreshing = (async (): Promise<RefreshResult> => {
    try {
      const res = await fetch("/api/offline/snapshot", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401 || res.status === 403) return { ok: false, reason: "auth" };
      if (!res.ok) return { ok: false, reason: "error" };
      const body = await res.json();
      if (!body?.ok) return { ok: false, reason: "error" };
      await saveSnapshot(body);
      return { ok: true };
    } catch {
      return { ok: false, reason: "offline" };
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

/** Downloads only if the copy on the device is older than `maxAgeMs`. */
export async function refreshIfStale(maxAgeMs = MIRROR_FRESH_MS): Promise<RefreshResult | null> {
  const age = await snapshotAge();
  if (age !== null && age < maxAgeMs) return null;
  return refreshSnapshot();
}

let scheduled: ReturnType<typeof setTimeout> | null = null;

/**
 * Called after a write the server accepted: the local copy is now one payment
 * (or one student) behind. Debounced, because a burst of writes at the counter
 * should cost one download, not ten.
 */
export function scheduleSnapshotRefresh(delayMs = 1500) {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (scheduled) clearTimeout(scheduled);
  scheduled = setTimeout(() => {
    scheduled = null;
    void refreshSnapshot();
  }, delayMs);
}

export type SyncOutcome = {
  synced: number;
  failed: number;
  pending: number;
  errors: string[];
  refreshed: boolean;
};

/**
 * One reconnection, in order: send what was captured offline, then pull the
 * school back down so the device sees its own writes as the server stored them
 * (receipt numbers, matricules) plus anything another device did meanwhile.
 */
export async function syncAll(): Promise<SyncOutcome> {
  const flushed = await flushQueue();
  const refresh = await refreshSnapshot();
  return { ...flushed, refreshed: refresh.ok };
}

export type LocalDataState = {
  data: MirrorData | null;
  loading: boolean;
  /** Null while nothing has ever been downloaded on this device. */
  syncedAt: Date | null;
};

/**
 * Subscribes a screen to the local copy: it re-reads whenever a new snapshot
 * lands or the outbox changes, so a payment taken offline appears at once.
 */
export function useLocalData(): LocalDataState & { reload: () => void } {
  const [state, setState] = useState<LocalDataState>({ data: null, loading: true, syncedAt: null });

  const reload = useCallback(async () => {
    const data = await loadLocalData();
    setState({ data, loading: false, syncedAt: data?.syncedAt ?? null });
  }, []);

  useEffect(() => {
    // The local copy is an external store (IndexedDB), not derived render state:
    // read it on mount, then follow its change events.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    const handler = () => void reload();
    window.addEventListener(MIRROR_CHANGED, handler);
    window.addEventListener(QUEUE_CHANGED, handler);
    return () => {
      window.removeEventListener(MIRROR_CHANGED, handler);
      window.removeEventListener(QUEUE_CHANGED, handler);
    };
  }, [reload]);

  return { ...state, reload: () => void reload() };
}
