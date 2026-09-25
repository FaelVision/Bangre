"use client";

import { openDB, type IDBPDatabase } from "idb";

/**
 * The single IndexedDB database every offline feature shares: the outbox of
 * writes made without a network (`offline-queue.ts`) and the full local copy
 * of the school's data (`offline-mirror.ts`).
 *
 * One database, one version number — opening the same database twice with
 * different versions throws, so both modules go through here.
 */

const DB_NAME = "bangre-offline";
/** v3 → v4 adds the mirror store. Queued entries from earlier versions survive. */
const DB_VERSION = 4;

export const QUEUE_STORE = "pending-payments"; // kept from v1 so existing queued items survive
export const CONTEXT_STORE = "payment-context"; // last-seen tranche state per student
export const MIRROR_STORE = "mirror"; // the downloaded copy of the school's data

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb() {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(CONTEXT_STORE)) {
          db.createObjectStore(CONTEXT_STORE, { keyPath: "studentId" });
        }
        if (!db.objectStoreNames.contains(MIRROR_STORE)) {
          db.createObjectStore(MIRROR_STORE, { keyPath: "key" });
        }
      },
      blocked() {
        // Another tab still holds the old version; it will pick the new one up
        // on its next reload. Nothing to do but let this open wait.
      },
    });
  }
  return dbPromise;
}
