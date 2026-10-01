"use client";

import {
  confirmCanteenReminderAction,
  enrollCanteenAction,
  getCanteenPaymentContextAction,
  leaveCanteenAction,
  previewCanteenRemindersAction,
  recordCanteenPaymentAction,
  setCanteenSkipAction,
  changeCanteenStartAction,
  undoCanteenActionAction,
} from "@/lib/actions/canteen";
import { canteenConfirmationMessage } from "@/lib/canteen";
import {
  canteenPaymentContext,
  canteenReminderFor,
  type CanteenPaymentContext,
  type PreparedCanteenReminder,
} from "@/lib/canteen-overview";
import { canteenDataset, isLocalId } from "@/lib/offline-data";
import { loadLocalData, scheduleSnapshotRefresh } from "@/lib/offline-mirror";
import { enqueue, queueId, type CanteenPaymentPayload } from "@/lib/offline-queue";
import { isNetworkError, isOffline, withNetwork } from "@/lib/connectivity";
import { buildWhatsAppLink } from "@/lib/whatsapp-link";
import { serviceInfo, type SchoolService } from "@/lib/services";

/**
 * The canteen and the garde d'enfants, online or not. Each write tries the
 * server first; without a network it goes to the device outbox and the local
 * copy shows it at once — the same rules (`canteen.ts`) price and check it on
 * both sides. Every function takes the service it is about.
 */

/** True when the server should not even be tried for this student. */
function deviceOnly(studentId?: string) {
  return isOffline() || (studentId ? isLocalId(studentId) : false);
}

async function localDataset(service: SchoolService) {
  const data = await loadLocalData();
  return data ? canteenDataset(data, service) : null;
}

export async function loadCanteenPaymentContext(
  studentId: string,
  service: SchoolService
): Promise<{ context: CanteenPaymentContext; local: boolean } | { error: string }> {
  if (!deviceOnly(studentId)) {
    try {
      const res = await withNetwork(() => getCanteenPaymentContextAction(studentId, service), 8000);
      return "error" in res ? res : { context: res, local: false };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  const ds = await localDataset(service);
  if (!ds) return { error: "Aucune donnée sur cet appareil : connectez-vous une fois au réseau." };
  const res = canteenPaymentContext(ds, studentId);
  return "error" in res ? res : { context: res, local: true };
}

export type CanteenPaymentOutcome =
  | { ok: true; paymentId: string; receiptNumber: number; amount: number; label: string; whatsappUrl: string | null }
  | { ok: true; queued: true; amount: number; label: string; whatsappUrl: string | null }
  | { ok: false; error: string };

export async function submitCanteenPayment(
  payload: CanteenPaymentPayload,
  preview: { amount: number; label: string; studentName: string }
): Promise<CanteenPaymentOutcome> {
  // One id for both paths: an online attempt that did reach the server is
  // recognised when the queued copy arrives, instead of paid twice.
  const ref = queueId();

  if (!deviceOnly(payload.studentId)) {
    try {
      const res = await withNetwork(() => recordCanteenPaymentAction({ ...payload, clientRef: `sync:${ref}` }), 15000);
      if (res.ok) scheduleSnapshotRefresh();
      return res;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }

  await enqueue(
    { kind: "canteen.payment", payload },
    `${serviceInfo(payload.service).title} ${preview.amount.toLocaleString("fr-FR")} CFA · ${preview.studentName}`,
    ref
  );
  return {
    ok: true,
    queued: true,
    amount: preview.amount,
    label: preview.label,
    whatsappUrl: payload.notifyWhatsapp ? await localConfirmationLink(payload, preview).catch(() => null) : null,
  };
}

async function localConfirmationLink(payload: CanteenPaymentPayload, preview: { amount: number; label: string }) {
  const data = await loadLocalData();
  const student = data?.students.find((s) => s.id === payload.studentId);
  const clazz = data?.classes.find((c) => c.id === student?.classId);
  if (!data || !student?.parentPhone) return null;
  return buildWhatsAppLink(
    student.parentPhone,
    canteenConfirmationMessage({
      service: payload.service,
      amount: preview.amount,
      label: preview.label,
      studentFirstName: student.firstName,
      studentLastName: student.lastName,
      className: clazz?.name ?? "",
      date: payload.date ? new Date(payload.date) : new Date(),
      schoolName: data.school.name,
      receiptNumber: null,
    })
  );
}

/** Enrols students from `startMonth`; offline, one outbox entry each. */
export async function enrollInCanteen(
  students: { id: string; label: string }[],
  startMonth: string | null,
  service: SchoolService
): Promise<{ enrolled: number; errors: string[]; queued: boolean }> {
  if (!students.some((s) => deviceOnly(s.id))) {
    try {
      const res = await withNetwork(() => enrollCanteenAction(students.map((s) => s.id), startMonth, service), 20000);
      scheduleSnapshotRefresh();
      return { ...res, queued: false };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  for (const s of students) {
    await enqueue(
      { kind: "canteen.enroll", studentId: s.id, startMonth, service },
      `Inscription ${serviceInfo(service).noun} · ${s.label}`
    );
  }
  return { enrolled: students.length, errors: [], queued: true };
}

export async function leaveCanteen(
  student: { id: string; label: string },
  endMonth: string,
  service: SchoolService
): Promise<{ ok: true; queued: boolean } | { ok: false; error: string }> {
  if (!deviceOnly(student.id)) {
    try {
      const res = await withNetwork(() => leaveCanteenAction(student.id, endMonth, service), 10000);
      if (res.ok) scheduleSnapshotRefresh();
      return res.ok ? { ok: true, queued: false } : res;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  await enqueue(
    { kind: "canteen.leave", studentId: student.id, endMonth, service },
    `Sortie de ${serviceInfo(service).noun} · ${student.label}`
  );
  return { ok: true, queued: true };
}

/** Marks a month "sans cantine" / "sans garde" (or takes the mark off); offline, it waits in the outbox. */
export async function setCanteenSkip(
  student: { id: string; label: string },
  month: string,
  skipped: boolean,
  service: SchoolService
): Promise<{ ok: true; queued: boolean } | { ok: false; error: string }> {
  if (!deviceOnly(student.id)) {
    try {
      const res = await withNetwork(() => setCanteenSkipAction(student.id, month, skipped, service), 10000);
      if (res.ok) scheduleSnapshotRefresh();
      return res.ok ? { ok: true, queued: false } : res;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  const info = serviceInfo(service);
  await enqueue(
    { kind: "canteen.skip", studentId: student.id, month, skipped, service },
    `${skipped ? `Mois ${info.without}` : `Mois de ${info.noun}`} · ${student.label}`
  );
  return { ok: true, queued: true };
}

const NEEDS_NETWORK = "Pas de connexion : cette correction se fait en ligne. Réessayez au retour du réseau.";

/**
 * Undoes one action of the history. Online only: the history is kept by the
 * server, and an undo checks what was done since on every device.
 */
export async function undoCanteenAction(actionId: string, reason?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isOffline()) return { ok: false, error: NEEDS_NETWORK };
  try {
    const res = await withNetwork(() => undoCanteenActionAction(actionId, reason), 15000);
    if (res.ok) scheduleSnapshotRefresh();
    return res;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    return { ok: false, error: NEEDS_NETWORK };
  }
}

/** Corrects the first month of a student's current stretch. Online only, like an undo. */
export async function changeCanteenStart(
  studentId: string,
  startMonth: string,
  service: SchoolService
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (deviceOnly(studentId)) return { ok: false, error: NEEDS_NETWORK };
  try {
    const res = await withNetwork(() => changeCanteenStartAction(studentId, startMonth, service), 10000);
    if (res.ok) scheduleSnapshotRefresh();
    return res;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    return { ok: false, error: NEEDS_NETWORK };
  }
}

/** The rappels of several families, each with the reason it was skipped if any. */
export async function prepareCanteenReminders(
  studentIds: string[],
  service: SchoolService
): Promise<{ prepared: PreparedCanteenReminder[]; skipped: number; error?: string }> {
  let results: (PreparedCanteenReminder | { error: string })[] | null = null;
  if (!studentIds.some((id) => deviceOnly(id))) {
    try {
      results = await withNetwork(() => previewCanteenRemindersAction(studentIds, service), 15000);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  if (!results) {
    const ds = await localDataset(service);
    if (!ds) return { prepared: [], skipped: studentIds.length, error: "Aucune donnée sur cet appareil." };
    results = studentIds.map((id) => canteenReminderFor(ds, id));
  }
  const prepared = results.filter((r): r is PreparedCanteenReminder => !("error" in r));
  const firstError = results.find((r): r is { error: string } => "error" in r)?.error;
  return { prepared, skipped: results.length - prepared.length, error: firstError };
}

/** Records a rappel once WhatsApp was opened, with the text finally sent. */
export async function confirmCanteenReminder(item: PreparedCanteenReminder, message: string, service: SchoolService) {
  if (!deviceOnly(item.studentId)) {
    try {
      await withNetwork(() => confirmCanteenReminderAction(item.studentId, message, service), 8000);
      scheduleSnapshotRefresh();
      return { queued: false };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  await enqueue(
    { kind: "canteen.reminder", studentId: item.studentId, message, service },
    `Rappel ${serviceInfo(service).noun} · ${item.label}`
  );
  return { queued: true };
}
