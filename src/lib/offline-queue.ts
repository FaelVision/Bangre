"use client";

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "bangre-offline";
const STORE = "pending-payments";

export type QueuedPayment = {
  id: string;
  createdAt: number;
  payload: {
    studentId: string;
    mode: "tranches" | "partial";
    trancheIds: string[];
    amount: number;
    method: string;
    date: string;
    receivedBy: string;
    notifyWhatsapp: boolean;
  };
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueuePayment(payload: QueuedPayment["payload"]) {
  const db = await getDb();
  if (!db) return null;
  const entry: QueuedPayment = { id: crypto.randomUUID(), createdAt: Date.now(), payload };
  await db.put(STORE, entry);
  window.dispatchEvent(new CustomEvent("bangre:queue-changed"));
  return entry;
}

export async function listQueuedPayments(): Promise<QueuedPayment[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAll(STORE);
}

export async function removeQueuedPayment(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(STORE, id);
  window.dispatchEvent(new CustomEvent("bangre:queue-changed"));
}

/**
 * Attempts to flush every queued offline payment to the server. Called on
 * reconnect. Each entry is sent to the recordPayment API route; entries that
 * succeed are removed, failures stay queued for the next attempt.
 */
export async function flushQueuedPayments() {
  const entries = await listQueuedPayments();
  for (const entry of entries) {
    try {
      const res = await fetch("/api/payments/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.payload),
      });
      if (res.ok) {
        await removeQueuedPayment(entry.id);
      }
    } catch {
      // Still offline or server unreachable — leave it queued.
      break;
    }
  }
}
