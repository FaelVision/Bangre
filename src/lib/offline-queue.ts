"use client";

import { openDB, type IDBPDatabase } from "idb";

/**
 * Outbox of writes captured while offline. Everything the secretary does at the
 * counter without a connection lands here and is replayed, in order, against
 * /api/sync as soon as the network comes back.
 */

const DB_NAME = "bangre-offline";
const STORE = "pending-payments"; // kept from v1 so existing queued items survive
const CONTEXT_STORE = "payment-context"; // last-seen tranche state per student, for offline
const DB_VERSION = 3;

export type PaymentPayload = {
  studentId: string;
  mode: "tranches" | "partial";
  trancheIds: string[];
  amount: number;
  method: string;
  date: string;
  receivedBy: string;
  notifyWhatsapp: boolean;
};

export type StudentPayload = {
  classId: string;
  matricule?: string;
  lastName: string;
  firstName: string;
  birthDate?: string;
  gender?: string;
  parentName?: string;
  parentPhone?: string;
  whatsappStatus?: string;
};

export type QueuedOperation =
  | { kind: "payment"; payload: PaymentPayload }
  | { kind: "student.create"; payload: StudentPayload }
  | { kind: "student.update"; studentId: string; payload: StudentPayload };

export type QueuedEntry = QueuedOperation & {
  id: string;
  createdAt: number;
  label: string;
  attempts: number;
  lastError?: string;
};

export const QUEUE_CHANGED = "bangre:queue-changed";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(CONTEXT_STORE)) {
          db.createObjectStore(CONTEXT_STORE, { keyPath: "studentId" });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * `crypto.randomUUID` only exists in secure contexts, and the app is served
 * over plain http on the school's local network — so it is missing exactly
 * where the offline queue matters most. Fall back to a random local id.
 */
function queueId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function notifyChanged() {
  window.dispatchEvent(new CustomEvent(QUEUE_CHANGED));
}

/** Adds one operation to the outbox. `label` is what the user sees while it waits. */
export async function enqueue(operation: QueuedOperation, label: string): Promise<QueuedEntry | null> {
  const db = await getDb();
  if (!db) return null;

  const entry = { ...operation, id: queueId(), createdAt: Date.now(), label, attempts: 0 } as QueuedEntry;
  await db.put(STORE, entry);
  notifyChanged();
  void requestBackgroundSync();
  return entry;
}

/** Backwards-compatible helper used by the payment modal. */
export async function enqueuePayment(payload: PaymentPayload, label = "Paiement") {
  return enqueue({ kind: "payment", payload }, label);
}

export async function listQueued(): Promise<QueuedEntry[]> {
  const db = await getDb();
  if (!db) return [];
  const all = (await db.getAll(STORE)) as Partial<QueuedEntry>[];
  // Entries written by v1 had no `kind`, `label` or `attempts`; they were all
  // payments, so fill those in rather than dropping queued work on upgrade.
  return all
    .map(
      (e) =>
        ({ ...e, kind: e.kind ?? "payment", label: e.label ?? "Paiement", attempts: e.attempts ?? 0 }) as QueuedEntry
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeQueued(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(STORE, id);
  notifyChanged();
}

async function markFailure(entry: QueuedEntry, error: string) {
  const db = await getDb();
  if (!db) return;
  await db.put(STORE, { ...entry, attempts: entry.attempts + 1, lastError: error });
  notifyChanged();
}

export type FlushResult = { synced: number; failed: number; pending: number; errors: string[] };

let flushing = false;

/**
 * Replays the outbox oldest-first. An entry the server rejects for a permanent
 * reason (duplicate matricule, deleted student…) is dropped with its message
 * kept, otherwise a single bad row would block the queue forever. A network
 * failure stops the run and leaves everything queued for the next attempt.
 */
export async function flushQueue(): Promise<FlushResult> {
  if (flushing) return { synced: 0, failed: 0, pending: (await listQueued()).length, errors: [] };
  flushing = true;

  const result: FlushResult = { synced: 0, failed: 0, pending: 0, errors: [] };

  try {
    for (const entry of await listQueued()) {
      let res: Response;
      try {
        res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        });
      } catch {
        break; // still offline — keep everything for later
      }

      if (res.status === 401) {
        result.errors.push("Session expirée : reconnectez-vous pour synchroniser.");
        break;
      }

      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; permanent?: boolean };

      if (res.ok && body.ok) {
        await removeQueued(entry.id);
        result.synced += 1;
      } else if (body.permanent) {
        await removeQueued(entry.id);
        result.failed += 1;
        result.errors.push(`${entry.label} : ${body.error ?? "refusé par le serveur"}`);
      } else {
        await markFailure(entry, body.error ?? "erreur serveur");
        result.failed += 1;
        result.errors.push(`${entry.label} : ${body.error ?? "erreur serveur"}`);
        break;
      }
    }
  } finally {
    flushing = false;
  }

  result.pending = (await listQueued()).length;
  notifyChanged();
  return result;
}

/** Asks the browser to retry the queue on its own once connectivity returns. */
async function requestBackgroundSync() {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    await reg.sync?.register("bangre-sync");
  } catch {
    // Background Sync is not available everywhere; the online listener covers it.
  }
}

/**
 * Payment-context cache. Every time the modal loads a student's tranche state
 * online we stash it here, so the same student can be paid *with the real
 * tranche breakdown* while offline — not just a free amount. The cached copy
 * may be slightly stale (a classmate's payment, a config change) but the server
 * re-computes the true allocation at sync time, so it is only a UI aid.
 */
export type CachedPaymentContext = {
  studentId: string;
  cachedAt: number;
  context: unknown;
};

export async function savePaymentContext(studentId: string, context: unknown) {
  const db = await getDb();
  if (!db) return;
  await db.put(CONTEXT_STORE, { studentId, cachedAt: Date.now(), context } as CachedPaymentContext);
}

export async function loadPaymentContext(studentId: string): Promise<CachedPaymentContext | null> {
  const db = await getDb();
  if (!db) return null;
  return ((await db.get(CONTEXT_STORE, studentId)) as CachedPaymentContext | undefined) ?? null;
}

// Legacy names kept so older imports keep working.
export const listQueuedPayments = listQueued;
export const removeQueuedPayment = removeQueued;
export const flushQueuedPayments = flushQueue;
