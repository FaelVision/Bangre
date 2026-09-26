"use client";

import { getDb, QUEUE_STORE as STORE, CONTEXT_STORE, MIRROR_STORE } from "@/lib/offline-db";
import { isOffline, reportReachable, reportUnreachable } from "@/lib/connectivity";

/**
 * One entry is one small write: an answer slower than this means the network
 * is hanging. Without a limit, a hung replay kept the outbox locked (`flushing`)
 * until the page was reloaded, and nothing was ever sent.
 */
const SYNC_TIMEOUT_MS = 20_000;

/**
 * Outbox of writes captured while offline. Everything the secretary does at the
 * counter without a connection lands here and is replayed, in order, against
 * /api/sync as soon as the network comes back.
 */

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
  | { kind: "student.update"; studentId: string; payload: StudentPayload }
  | { kind: "reminder.send"; studentId: string; trancheId: string | null; message: string };

export type QueuedEntry = QueuedOperation & {
  id: string;
  createdAt: number;
  label: string;
  attempts: number;
  lastError?: string;
  /**
   * The school the entry was typed for. A shared computer can be signed into
   * another school before the network comes back: its entries must wait for
   * their own account, never be replayed into someone else's.
   */
  schoolId?: string;
  /**
   * Set when the server refused the entry for good (class deleted, invalid
   * data…). The entry is kept, visible, until the user dismisses it: a payment
   * typed at the counter must never vanish silently.
   */
  rejectedAt?: number;
};

/** Prefix of the ids the device gives to students it created offline (see `offline-data.ts`). */
const LOCAL_STUDENT_PREFIX = "local:";

export const QUEUE_CHANGED = "bangre:queue-changed";

/**
 * `crypto.randomUUID` only exists in secure contexts, and the app is served
 * over plain http on the school's local network — so it is missing exactly
 * where the offline queue matters most. Fall back to a random local id.
 */
export function queueId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function notifyChanged() {
  window.dispatchEvent(new CustomEvent(QUEUE_CHANGED));
}

/** The school whose copy is on this device — the one the user is working in. */
export async function currentSchoolId(): Promise<string | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  try {
    const stored = (await db.get(MIRROR_STORE, "current")) as { snapshot?: { school?: { id?: unknown } } } | undefined;
    const id = stored?.snapshot?.school?.id;
    return typeof id === "string" ? id : undefined;
  } catch {
    return undefined;
  }
}

/** Adds one operation to the outbox. `label` is what the user sees while it waits. */
export async function enqueue(
  operation: QueuedOperation,
  label: string,
  /**
   * Given when the same write was first tried online under this id: if that
   * attempt did reach the server after all, the replay is recognised instead
   * of recorded twice.
   */
  id = queueId()
): Promise<QueuedEntry | null> {
  const db = await getDb();
  if (!db) return null;

  const entry = {
    ...operation,
    id,
    createdAt: Date.now(),
    label,
    attempts: 0,
    schoolId: await currentSchoolId(),
  } as QueuedEntry;
  await db.put(STORE, entry);
  notifyChanged();
  void requestBackgroundSync();
  return entry;
}

/** Backwards-compatible helper used by the payment modal. */
export async function enqueuePayment(payload: PaymentPayload, label = "Paiement", id?: string) {
  return enqueue({ kind: "payment", payload }, label, id);
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

/** What still has to reach the server — refused entries excluded. */
export async function listPending(): Promise<QueuedEntry[]> {
  return (await listQueued()).filter((e) => !e.rejectedAt);
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

async function markRejected(entry: QueuedEntry, error: string) {
  const db = await getDb();
  if (!db) return;
  await db.put(STORE, { ...entry, attempts: entry.attempts + 1, lastError: error, rejectedAt: Date.now() });
  notifyChanged();
}

/** The student an entry is about, whatever its kind. */
function studentIdOf(entry: QueuedEntry): string | null {
  if (entry.kind === "payment") return entry.payload.studentId;
  if (entry.kind === "student.update" || entry.kind === "reminder.send") return entry.studentId;
  return null;
}

function withStudentId(entry: QueuedEntry, studentId: string): QueuedEntry {
  if (entry.kind === "payment") return { ...entry, payload: { ...entry.payload, studentId } };
  if (entry.kind === "student.update" || entry.kind === "reminder.send") return { ...entry, studentId };
  return entry;
}

/**
 * A student created offline is known on the device as `local:<entry id>`, and
 * whatever was typed for them afterwards (a payment, a correction, a rappel)
 * points at that id. Once the server has created them, those entries are
 * rewritten to the real id — otherwise the server would not find the student
 * and the payment taken for them would be refused.
 */
async function adoptServerId(entries: QueuedEntry[], from: number, localId: string, serverId: string) {
  const db = await getDb();
  for (let i = from; i < entries.length; i++) {
    if (studentIdOf(entries[i]) !== localId) continue;
    entries[i] = withStudentId(entries[i], serverId);
    if (db) await db.put(STORE, entries[i]);
  }
}

export type FlushResult = { synced: number; failed: number; pending: number; errors: string[] };

let flushing = false;

/**
 * Replays the outbox oldest-first. An entry the server rejects for a permanent
 * reason (deleted class, invalid data…) is set aside — kept and shown until the
 * user dismisses it — otherwise a single bad row would block the queue forever.
 * A network failure stops the run and leaves everything queued for the next
 * attempt; the server recognises an entry it already applied (the response was
 * lost), so a retry never records the same payment twice.
 */
export async function flushQueue(): Promise<FlushResult> {
  if (isOffline()) return { synced: 0, failed: 0, pending: (await listPending()).length, errors: [] };
  if (flushing) return { synced: 0, failed: 0, pending: (await listPending()).length, errors: [] };
  flushing = true;

  const result: FlushResult = { synced: 0, failed: 0, pending: 0, errors: [] };

  try {
    const entries = await listPending();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      let res: Response;
      try {
        res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
          signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
        });
        reportReachable();
      } catch {
        reportUnreachable();
        break; // still offline — keep everything for later
      }

      if (res.status === 401) {
        result.errors.push("Session expirée : reconnectez-vous pour synchroniser.");
        break;
      }

      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        permanent?: boolean;
        otherSchool?: boolean;
        studentId?: string;
      };

      if (body.otherSchool) {
        // Typed for another school signed in on this device earlier: it waits
        // for that account, untouched.
        continue;
      }

      if (res.ok && body.ok) {
        await removeQueued(entry.id);
        result.synced += 1;
        if (entry.kind === "student.create" && body.studentId) {
          await adoptServerId(entries, i + 1, `${LOCAL_STUDENT_PREFIX}${entry.id}`, body.studentId);
        }
      } else if (body.permanent) {
        await markRejected(entry, body.error ?? "refusé par le serveur");
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

  result.pending = (await listPending()).length;
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
