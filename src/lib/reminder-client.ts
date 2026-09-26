"use client";

import { previewReminderAction, bulkPreviewRemindersAction, confirmReminderSentAction } from "@/lib/actions/students";
import { previewForStudent } from "@/lib/reminder-message";
import { findStudentWithPayments, isLocalId, studentsWithPayments } from "@/lib/offline-data";
import { loadLocalData, scheduleSnapshotRefresh } from "@/lib/offline-mirror";
import { enqueue } from "@/lib/offline-queue";

/**
 * Rappels WhatsApp, online or not.
 *
 * The message is built by `reminder-message.ts` on both sides, so a rappel
 * prepared from the device reads exactly like one prepared by the server. What
 * differs is the recording: offline, "envoyé" goes to the outbox and reaches
 * the server at the next synchronisation.
 */

export type PreparedReminder = {
  studentId: string;
  trancheId: string | null;
  label: string;
  phone: string;
  message: string;
};

function isOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

async function localPreviews(studentIds: string[]) {
  const data = await loadLocalData();
  if (!data) return null;

  const prepared: PreparedReminder[] = [];
  let skipped = 0;
  for (const id of studentIds) {
    const student = findStudentWithPayments(data, id);
    if (!student) {
      skipped += 1;
      continue;
    }
    const res = previewForStudent(student, data.school.name);
    if (res.ok) prepared.push(res);
    else skipped += 1;
  }
  return { prepared, skipped };
}

/** One student. Returns the reason the rappel cannot be sent, if any. */
export async function prepareReminder(studentId: string): Promise<PreparedReminder | { error: string }> {
  // A student created on this device and not synced yet only exists here.
  if (!isOffline() && !isLocalId(studentId)) {
    try {
      const res = await previewReminderAction(studentId);
      if ("error" in res) return { error: res.error ?? "Rappel indisponible." };
      return res;
    } catch {
      // Network gone between the click and the call — fall through to the copy
      // on the device rather than failing in the user's face.
    }
  }

  const local = await localPreviews([studentId]);
  if (!local) return { error: "Aucune donnée locale : connectez-vous une fois au réseau." };
  const [first] = local.prepared;
  if (!first) return { error: "Aucun rappel à envoyer pour cet élève." };
  return first;
}

/** Several students at once — the bulk "Envoyer les rappels" flows. */
export async function prepareReminders(studentIds: string[]): Promise<{ prepared: PreparedReminder[]; skipped: number }> {
  if (studentIds.length === 0) return { prepared: [], skipped: 0 };

  if (!isOffline() && !studentIds.some(isLocalId)) {
    try {
      const res = await bulkPreviewRemindersAction(studentIds);
      return { prepared: res.prepared, skipped: res.skipped };
    } catch {
      /* offline after all — use the local copy */
    }
  }

  return (await localPreviews(studentIds)) ?? { prepared: [], skipped: studentIds.length };
}

/**
 * Records a rappel as sent, with whatever text the user finally opened. Queued
 * when there is no network, so the student file and the retards list stop
 * showing "aucun rappel" the moment WhatsApp was opened.
 */
export async function confirmReminderSent(item: PreparedReminder, message: string): Promise<{ queued: boolean }> {
  if (!isOffline() && !isLocalId(item.studentId)) {
    try {
      await confirmReminderSentAction(item.studentId, item.trancheId, message);
      scheduleSnapshotRefresh();
      return { queued: false };
    } catch {
      /* fall through to the outbox */
    }
  }

  await enqueue(
    { kind: "reminder.send", studentId: item.studentId, trancheId: item.trancheId, message },
    `Rappel WhatsApp · ${item.label}`
  );
  return { queued: true };
}

/** Labels for the students a bulk rappel would target, from the local copy. */
export async function localReachableStudents() {
  const data = await loadLocalData();
  if (!data) return [];
  return studentsWithPayments(data)
    .filter((s) => s.status === "active" && s.whatsappStatus === "reachable")
    .map((s) => ({ id: s.id, label: `${s.lastName} ${s.firstName}` }));
}
