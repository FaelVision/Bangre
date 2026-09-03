"use client";

import { enqueue, type StudentPayload } from "@/lib/offline-queue";

/** Shared shape returned by the offline-aware student actions. */
export type StudentFormState = { error?: string; queued?: string } | undefined;

export function studentPayloadFrom(formData: FormData): StudentPayload {
  const get = (k: string) => ((formData.get(k) as string) ?? "").trim();
  return {
    classId: get("classId"),
    matricule: get("matricule"),
    lastName: get("lastName"),
    firstName: get("firstName"),
    birthDate: get("birthDate"),
    gender: get("gender"),
    parentName: get("parentName"),
    parentPhone: get("parentPhone"),
    whatsappStatus: get("whatsappStatus"),
  };
}

/**
 * A successful server action navigates by throwing a redirect signal. It must
 * pass through untouched — swallowing it would both break the navigation and
 * queue a duplicate of a record that was in fact saved.
 */
export function isRedirectSignal(err: unknown) {
  const digest = (err as { digest?: unknown })?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND"));
}

/**
 * Runs a server action, falling back to the offline outbox when the network is
 * unavailable — so a form filled in at the counter is never lost.
 */
export async function runOrQueue(
  run: () => Promise<StudentFormState>,
  queued: { payload: StudentPayload; studentId?: string; label: string }
): Promise<StudentFormState> {
  const operation = queued.studentId
    ? ({ kind: "student.update", studentId: queued.studentId, payload: queued.payload } as const)
    : ({ kind: "student.create", payload: queued.payload } as const);

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await enqueue(operation, queued.label);
    return { queued: queued.label };
  }

  try {
    return await run();
  } catch (err) {
    if (isRedirectSignal(err)) throw err;
    await enqueue(operation, queued.label);
    return { queued: queued.label };
  }
}
