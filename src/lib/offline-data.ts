import type { PaymentAllocation, Reminder, Student, Tranche } from "@prisma/client";
import type { ClassWithTranches, PaymentWithAllocations, StudentWithPayments } from "@/lib/tuition";
import { allocatePayment, computeTrancheStates } from "@/lib/tuition";
import { nextMatricule, normalizeMatricule } from "@/lib/matricule";
import { normalizePhone } from "@/lib/phone";
import { parseDateInput } from "@/lib/date";
import type { QueuedEntry } from "@/lib/offline-queue";

/**
 * The device's own copy of the school's data, and the rules for reading it.
 *
 * Everything here is pure: it takes the snapshot downloaded from
 * `/api/offline/snapshot` (plus whatever is still waiting in the outbox) and
 * gives back the same entity shapes the server works with, so the tuition and
 * payment logic in `tuition.ts` applies unchanged offline.
 */

export type MirrorSchool = {
  id: string;
  name: string;
  contactName: string;
  city: string | null;
  type: string | null;
  receiptCounter: number;
  subscriptionStatus: string;
  subscriptionRenewsAt: Date | null;
  trialEndsAt: Date | null;
  blocked: boolean;
};

export type MirrorData = {
  syncedAt: Date;
  school: MirrorSchool;
  academicYear: { id: string; label: string } | null;
  classes: ClassWithTranches[];
  students: Student[];
  payments: PaymentWithAllocations[];
  reminders: Reminder[];
};

/** Rows the outbox added on top of the snapshot — the server has not seen them yet. */
export const LOCAL_ID_PREFIX = "local:";

export function isLocalId(id: string) {
  return id.startsWith(LOCAL_ID_PREFIX);
}

function date(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function optionalDate(value: unknown): Date | null {
  return value == null ? null : date(value);
}

type RawSnapshot = {
  syncedAt: string;
  school: Record<string, unknown>;
  academicYear: { id: string; label: string } | null;
  classes: Record<string, unknown>[];
  students: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  reminders: Record<string, unknown>[];
};

/**
 * JSON has no dates. Every screen computes with real `Date` objects (échéances,
 * jours de retard, « encaissé aujourd hui »), so they are revived once, here,
 * rather than defended against everywhere else.
 */
export function reviveSnapshot(raw: unknown): MirrorData {
  const snapshot = raw as RawSnapshot;

  return {
    syncedAt: date(snapshot.syncedAt),
    school: {
      ...(snapshot.school as unknown as MirrorSchool),
      subscriptionRenewsAt: optionalDate(snapshot.school.subscriptionRenewsAt),
      trialEndsAt: optionalDate(snapshot.school.trialEndsAt),
    },
    academicYear: snapshot.academicYear,
    classes: snapshot.classes.map((c) => ({
      ...(c as unknown as ClassWithTranches),
      createdAt: date(c.createdAt),
      tranches: ((c.tranches ?? []) as Record<string, unknown>[]).map((t) => ({
        ...(t as unknown as Tranche),
        dueDate: date(t.dueDate),
      })),
    })),
    students: snapshot.students.map((s) => ({
      ...(s as unknown as Student),
      birthDate: optionalDate(s.birthDate),
      createdAt: date(s.createdAt),
    })),
    payments: snapshot.payments.map((p) => ({
      ...(p as unknown as PaymentWithAllocations),
      date: date(p.date),
      allocations: ((p.allocations ?? []) as unknown as PaymentAllocation[]).slice(),
    })),
    reminders: snapshot.reminders.map((r) => ({
      ...(r as unknown as Reminder),
      sentAt: date(r.sentAt),
    })),
  };
}

/** Each student with their class and payments — the shape `tuition.ts` expects. */
export function studentsWithPayments(data: MirrorData): StudentWithPayments[] {
  const classById = new Map(data.classes.map((c) => [c.id, c]));
  const paymentsByStudent = new Map<string, PaymentWithAllocations[]>();
  for (const payment of data.payments) {
    const list = paymentsByStudent.get(payment.studentId);
    if (list) list.push(payment);
    else paymentsByStudent.set(payment.studentId, [payment]);
  }

  const out: StudentWithPayments[] = [];
  for (const student of data.students) {
    const clazz = classById.get(student.classId);
    // A student whose class is missing from the snapshot (deleted from another
    // device) has nothing to compute against — leave them out rather than crash.
    if (!clazz) continue;
    out.push({ ...student, class: clazz, payments: paymentsByStudent.get(student.id) ?? [] });
  }
  return out;
}

export function findStudentWithPayments(data: MirrorData, studentId: string): StudentWithPayments | null {
  const student = data.students.find((s) => s.id === studentId);
  if (!student) return null;
  const clazz = data.classes.find((c) => c.id === student.classId);
  if (!clazz) return null;
  return {
    ...student,
    class: clazz,
    payments: data.payments.filter((p) => p.studentId === student.id),
  };
}

/**
 * Folds the outbox into the local copy, so a payment taken at the counter shows
 * up on the dashboard, in the class total and on the student file immediately —
 * the way it would have if the network had been there.
 *
 * The result is provisional: the server re-applies every entry at sync time and
 * the next snapshot replaces these rows with the real ones (numéros de reçu,
 * matricules et identifiants compris).
 */
export function applyPendingOperations(
  data: MirrorData,
  entries: QueuedEntry[],
  now: Date = new Date()
): MirrorData {
  if (entries.length === 0) return data;

  const result: MirrorData = {
    ...data,
    students: data.students.slice(),
    payments: data.payments.slice(),
    reminders: data.reminders.slice(),
  };

  const mine = entries.filter(
    // Refused entries never reached the server; entries typed for another
    // school signed in on this device earlier are not this school's data.
    (e) => !e.rejectedAt && (!e.schoolId || e.schoolId === data.school.id)
  );

  for (const entry of mine.sort((a, b) => a.createdAt - b.createdAt)) {
    switch (entry.kind) {
      case "student.create": {
        const payload = entry.payload;
        const matricule =
          normalizeMatricule(payload.matricule ?? "") || nextMatricule(result.students.map((s) => s.matricule));
        const phone = payload.parentPhone?.trim();
        result.students.push({
          id: `${LOCAL_ID_PREFIX}${entry.id}`,
          schoolId: data.school.id,
          classId: payload.classId,
          matricule,
          lastName: (payload.lastName ?? "").trim().toUpperCase(),
          firstName: (payload.firstName ?? "").trim(),
          birthDate: parseDateInput(payload.birthDate) ?? null,
          gender: payload.gender || null,
          parentName: payload.parentName?.trim() || null,
          parentPhone: phone ? normalizePhone(phone) : null,
          whatsappStatus: phone ? "reachable" : "unknown",
          status: "active",
          tuitionOverride: null,
          createdAt: new Date(entry.createdAt),
        });
        break;
      }

      case "student.update": {
        const index = result.students.findIndex((s) => s.id === entry.studentId);
        if (index === -1) break;
        const current = result.students[index];
        const payload = entry.payload;
        const phone = payload.parentPhone?.trim();
        result.students[index] = {
          ...current,
          matricule: normalizeMatricule(payload.matricule ?? "") || current.matricule,
          lastName: (payload.lastName ?? "").trim().toUpperCase() || current.lastName,
          firstName: (payload.firstName ?? "").trim() || current.firstName,
          birthDate: parseDateInput(payload.birthDate) ?? null,
          gender: payload.gender || null,
          parentName: payload.parentName?.trim() || null,
          parentPhone: phone ? normalizePhone(phone) : null,
          whatsappStatus: payload.whatsappStatus || current.whatsappStatus || "unknown",
        };
        break;
      }

      case "payment": {
        const student = findStudentWithPayments(result, entry.payload.studentId);
        if (!student) break;
        const states = computeTrancheStates(student.class.tranches, student.payments, now);
        const allocated = allocatePayment(states, entry.payload);
        if (!allocated.ok) break;

        const paymentId = `${LOCAL_ID_PREFIX}${entry.id}`;
        result.payments.unshift({
          id: paymentId,
          schoolId: data.school.id,
          studentId: student.id,
          amount: allocated.amount,
          method: entry.payload.method || "cash",
          receivedBy: entry.payload.receivedBy || null,
          date: entry.payload.date ? new Date(entry.payload.date) : new Date(entry.createdAt),
          // The server owns receipt numbering: it is assigned at sync time, so
          // until then the receipt has no number rather than a made-up one.
          receiptNumber: 0,
          note: null,
          offlineCreated: true,
          synced: false,
          whatsappNotified: false,
          allocations: allocated.allocations.map((a, i) => ({
            id: `${paymentId}:${i}`,
            paymentId,
            trancheId: a.trancheId,
            amount: a.amount,
          })),
        });
        break;
      }

      case "reminder.send": {
        result.reminders.unshift({
          id: `${LOCAL_ID_PREFIX}${entry.id}`,
          schoolId: data.school.id,
          studentId: entry.studentId,
          trancheId: entry.trancheId,
          channel: "whatsapp",
          trigger: "manual",
          status: "sent",
          providerMessageId: null,
          message: entry.message,
          sentAt: new Date(entry.createdAt),
        });
        break;
      }
    }
  }

  return result;
}
