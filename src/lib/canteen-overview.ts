import type { CanteenAction, CanteenEnrollment, CanteenReminder, CanteenSkip, Student } from "@prisma/client";
import {
  annualAvailable,
  availablePackages,
  canteenPricing,
  capitalize,
  type CanteenPricing,
  canteenReminderMessage,
  canteenSummary,
  monthKey,
  openEnrollment,
  packageMonths,
  planMonths,
  type CanteenMonthState,
  type CanteenPaymentWithMonths,
  type CanteenPlanWithPackages,
  type CanteenSummary,
} from "@/lib/canteen";
import { levelAllowed, serviceInfo, type SchoolService } from "@/lib/services";

/**
 * What the Cantine (and Garde d'enfants) screens show, computed from one
 * `CanteenDataset`. The server fills the dataset from the database
 * (`canteen-core.ts`), the device from its local copy (`offline-data.ts`):
 * both then read identical figures.
 */

export type CanteenStudent = Pick<
  Student,
  "id" | "firstName" | "lastName" | "matricule" | "classId" | "status" | "parentName" | "parentPhone" | "whatsappStatus"
> & { class: { name: string; level: string } };

export type CanteenDataset = {
  /** Which service the dataset is about: every row in it belongs to that one. */
  service: SchoolService;
  enabled: boolean;
  schoolName: string;
  contactName: string;
  receiptCounter: number;
  yearLabel: string;
  plan: CanteenPlanWithPackages | null;
  /** Every student of the school; the screens keep the active ones. */
  students: CanteenStudent[];
  /** The classes still in use, in display order. */
  classes: { id: string; name: string; level: string }[];
  /** This academic year's. */
  enrollments: CanteenEnrollment[];
  payments: CanteenPaymentWithMonths[];
  reminders: CanteenReminder[];
  /** This academic year's months marked "sans cantine". */
  skips: CanteenSkip[];
  /** The canteen history (recent), newest first. Null on the device: it is kept by the server. */
  actions: CanteenAction[] | null;
};

/** Whether an action can still be undone: only on the day it was made. */
export function undoableToday(createdAt: Date, now: Date = new Date()) {
  return (
    createdAt.getFullYear() === now.getFullYear() &&
    createdAt.getMonth() === now.getMonth() &&
    createdAt.getDate() === now.getDate()
  );
}

/** The months a student is marked as not eating at the canteen. */
export function skippedMonths(ds: Pick<CanteenDataset, "skips">, studentId: string) {
  return ds.skips.filter((s) => s.studentId === studentId).map((s) => s.month);
}

export const CANTEEN_PAGE_SIZE = 25;

export type CanteenRow = {
  student: CanteenStudent;
  enrolled: boolean;
  /** The first month the student ever ate at the canteen this year. */
  startMonth: string;
  /** When the stretch still running began; null once the student has left. */
  openStartMonth: string | null;
  summary: CanteenSummary;
  lastReminderAt: Date | null;
};

function groupBy<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Every active student who ate at the canteen this year, with their months. */
export function canteenRows(ds: CanteenDataset, now: Date = new Date()): CanteenRow[] {
  const plan = ds.plan;
  if (!plan) return [];
  const enrollmentsByStudent = groupBy(ds.enrollments, (e) => e.studentId);
  const paymentsByStudent = groupBy(ds.payments, (p) => p.studentId);
  const lastReminder = new Map<string, Date>();
  for (const r of ds.reminders) {
    const seen = lastReminder.get(r.studentId);
    if (!seen || seen < r.sentAt) lastReminder.set(r.studentId, r.sentAt);
  }

  return ds.students
    .filter((s) => s.status === "active" && enrollmentsByStudent.has(s.id))
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr"))
    .map((student) => {
      const enrollments = enrollmentsByStudent.get(student.id)!;
      const starts = enrollments.map((e) => e.startMonth).sort();
      const open = openEnrollment(enrollments);
      return {
        student,
        enrolled: open != null,
        startMonth: starts[0],
        openStartMonth: open?.startMonth ?? null,
        summary: canteenSummary(plan, enrollments, paymentsByStudent.get(student.id) ?? [], now, skippedMonths(ds, student.id)),
        lastReminderAt: lastReminder.get(student.id) ?? null,
      };
    });
}

/** Families behind on the canteen — the sidebar badge. */
export function canteenLateCount(ds: CanteenDataset, now: Date = new Date()) {
  if (!ds.enabled) return 0;
  return canteenRows(ds, now).filter((r) => r.summary.status === "retard").length;
}

export type CanteenVue = "inscrits" | "retards" | "paiements" | "historique";

export type CanteenFilter = { vue?: string; classe?: string; q?: string; page?: number };

export function parseCanteenVue(value: string | null | undefined): CanteenVue {
  return value === "retards" || value === "paiements" || value === "historique" ? value : "inscrits";
}

export function canteenOverview(ds: CanteenDataset, filter: CanteenFilter = {}, now: Date = new Date()) {
  const vue = parseCanteenVue(filter.vue);
  const all = canteenRows(ds, now);
  const studentById = new Map(ds.students.map((s) => [s.id, s]));

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const paidThisMonth = ds.payments.filter((p) => !p.cancelledAt && p.date.getTime() >= startOfMonth.getTime());
  const late = all.filter((r) => r.summary.status === "retard");
  const enrolledNow = all.filter((r) => r.enrolled);
  const currentMonth = monthKey(now);

  let rows = vue === "retards" ? late : all;
  if (vue === "retards") rows = [...rows].sort((a, b) => b.summary.lateAmount - a.summary.lateAmount);
  if (filter.classe) rows = rows.filter((r) => r.student.classId === filter.classe);
  if (filter.q) {
    const q = filter.q.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.student.lastName.toLowerCase().includes(q) ||
        r.student.firstName.toLowerCase().includes(q) ||
        r.student.matricule.toLowerCase().includes(q)
    );
  }

  const page = Math.max(1, filter.page ?? 1);
  const start = (page - 1) * CANTEEN_PAGE_SIZE;

  const allPayments = [...ds.payments].sort((a, b) => b.date.getTime() - a.date.getTime());
  const paymentList = vue === "paiements" ? allPayments : [];

  // The history: what was done, by kind, and whether it can still be undone.
  const actions = [...(ds.actions ?? [])].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const historyList = vue === "historique" ? actions : [];
  // A payment's own undo, offered from the journal while it is still possible.
  const undoByPayment = new Map<string, string>();
  for (const a of actions) {
    if (a.kind !== "payment" || a.undoneAt || !undoableToday(a.createdAt, now)) continue;
    const paymentId = (JSON.parse(a.data) as { paymentId?: string }).paymentId;
    if (paymentId) undoByPayment.set(paymentId, a.id);
  }

  const listLength =
    vue === "paiements" ? paymentList.length : vue === "historique" ? historyList.length : rows.length;

  return {
    service: ds.service,
    enabled: ds.enabled,
    yearLabel: ds.yearLabel,
    plan: ds.plan
      ? {
          monthlyPrice: ds.plan.monthlyPrice,
          annualPrice: ds.plan.annualPrice,
          firstMonth: ds.plan.firstMonth,
          lastMonth: ds.plan.lastMonth,
          dueDay: ds.plan.dueDay,
          monthCount: planMonths(ds.plan).length,
          packages: [...ds.plan.packages]
            .sort((a, b) => a.order - b.order)
            .map((p) => ({ id: p.id, label: p.label, price: p.price, months: packageMonths(p) })),
        }
      : null,
    vue,
    filters: { classe: filter.classe, q: filter.q },
    stats: {
      enrolledCount: enrolledNow.length,
      // "À jour" for this month: nothing late and the current month settled
      // (or not one the student is enrolled for).
      upToDateCount: enrolledNow.filter(
        (r) =>
          r.summary.status === "a_jour" &&
          r.summary.months.every((m) => m.month !== currentMonth || m.status === "paid")
      ).length,
      lateCount: late.length,
      lateAmount: late.reduce((s, r) => s + r.summary.lateAmount, 0),
      monthCollected: paidThisMonth.reduce((s, p) => s + p.amount, 0),
      monthReceipts: paidThisMonth.length,
      offlineCount: ds.payments.filter((p) => !p.synced).length,
    },
    rows: vue === "paiements" || vue === "historique" ? [] : rows.slice(start, start + CANTEEN_PAGE_SIZE),
    payments: paymentList.slice(start, start + CANTEEN_PAGE_SIZE).map((p) => {
      const student = studentById.get(p.studentId);
      return {
        id: p.id,
        studentId: p.studentId,
        studentName: student ? `${student.lastName} ${student.firstName}` : "Élève supprimé",
        className: student?.class.name ?? "—",
        receiptNumber: p.receiptNumber,
        date: p.date,
        label: p.label,
        amount: p.amount,
        synced: p.synced,
        cancelled: p.cancelledAt != null,
        cancelReason: p.cancelReason,
        undoActionId: undoByPayment.get(p.id) ?? null,
      };
    }),
    /** False on the device: the history is kept by the server. */
    historyAvailable: ds.actions !== null,
    history: historyList.slice(start, start + CANTEEN_PAGE_SIZE).map((a) => {
      const student = studentById.get(a.studentId);
      return {
        id: a.id,
        kind: a.kind,
        label: a.label,
        createdAt: a.createdAt,
        studentId: a.studentId,
        studentName: student ? `${student.lastName} ${student.firstName}` : "Élève supprimé",
        className: student?.class.name ?? "—",
        undoneAt: a.undoneAt,
        undoReason: a.undoReason,
        canUndo: !a.undoneAt && undoableToday(a.createdAt, now),
      };
    }),
    page,
    pageCount: Math.max(1, Math.ceil(listLength / CANTEEN_PAGE_SIZE)),
    total: listLength,
    // The garde only lists the classes it is open to.
    classes: ds.classes.filter((c) => levelAllowed(ds.service, c.level)).map((c) => ({ id: c.id, name: c.name })),
    currentMonth,
    /** Who the "Paiement" search offers: every student enrolled this year. */
    payable: all.map((r) => ({
      id: r.student.id,
      label: `${r.student.lastName} ${r.student.firstName} · ${r.student.class.name} · ${r.student.matricule}`,
    })),
    reachableLate: late
      .filter((r) => r.student.whatsappStatus === "reachable" && r.student.parentPhone)
      .map((r) => ({ id: r.student.id, label: `${r.student.lastName} ${r.student.firstName}` })),
  };
}

export type CanteenOverview = ReturnType<typeof canteenOverview>;

/**
 * Active students not in the service right now — who can be enrolled. The
 * garde only takes the pupils of maternelle and primaire classes.
 */
export function canteenEnrollCandidates(ds: CanteenDataset) {
  const open = new Set(ds.enrollments.filter((e) => e.endMonth == null).map((e) => e.studentId));
  const order = new Map(ds.classes.map((c, i) => [c.id, i]));
  return ds.students
    .filter(
      (s) => s.status === "active" && !open.has(s.id) && order.has(s.classId) && levelAllowed(ds.service, s.class.level)
    )
    .sort(
      (a, b) =>
        (order.get(a.classId) ?? 0) - (order.get(b.classId) ?? 0) ||
        a.lastName.localeCompare(b.lastName, "fr") ||
        a.firstName.localeCompare(b.firstName, "fr")
    )
    .map((s) => ({
      id: s.id,
      label: `${s.lastName} ${s.firstName}`,
      matricule: s.matricule,
      classId: s.classId,
      className: s.class.name,
    }));
}

export type CanteenEnrollCandidate = ReturnType<typeof canteenEnrollCandidates>[number];

/** What the canteen payment window needs about one student. */
export type CanteenPaymentContext = {
  student: { id: string; firstName: string; lastName: string; matricule: string; className: string };
  schoolName: string;
  receivedByDefault: string;
  nextReceiptNumber: number;
  /** The prices and owed months the window prices a selection against — the server's own rules. */
  pricing: CanteenPricing;
  annualAvailable: boolean;
  months: { month: string; status: CanteenMonthState["status"] }[];
};

export function canteenPaymentContext(
  ds: CanteenDataset,
  studentId: string,
  now: Date = new Date()
): CanteenPaymentContext | { error: string } {
  const info = serviceInfo(ds.service);
  if (!ds.enabled) return { error: `${capitalize(info.the)} n'est pas activée pour cet établissement.` };
  const plan = ds.plan;
  if (!plan) return { error: `Les tarifs de ${info.the} ne sont pas encore réglés pour cette année.` };
  const student = ds.students.find((s) => s.id === studentId);
  if (!student) return { error: "Élève introuvable." };
  const enrollments = ds.enrollments.filter((e) => e.studentId === studentId);
  if (enrollments.length === 0) return { error: `${student.firstName} ${student.lastName} n'est pas inscrit(e) à ${info.the}.` };

  const payments = ds.payments.filter((p) => p.studentId === studentId);
  const skipped = skippedMonths(ds, studentId);
  const pricing = canteenPricing(plan, enrollments, payments, skipped);
  const summary = canteenSummary(plan, enrollments, payments, now, skipped);

  return {
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      matricule: student.matricule,
      className: student.class.name,
    },
    schoolName: ds.schoolName,
    receivedByDefault: ds.contactName,
    nextReceiptNumber: ds.receiptCounter + 1,
    // Only the packages that still apply: every one of their months owed.
    pricing: { ...pricing, packages: availablePackages(pricing) },
    annualAvailable: annualAvailable(pricing),
    months: summary.months.map((m) => ({ month: m.month, status: m.status })),
  };
}

/**
 * The canteen (or garde) card of a student file. Null when the school does not
 * run the service, or when the pupil's class may not take it and never did.
 */
export function canteenStudentCard(ds: CanteenDataset, studentId: string, now: Date = new Date()) {
  if (!ds.enabled || !ds.plan) return null;
  const enrollments = ds.enrollments.filter((e) => e.studentId === studentId);
  const student = ds.students.find((s) => s.id === studentId);
  if (enrollments.length === 0 && !levelAllowed(ds.service, student?.class.level)) return null;
  const open = openEnrollment(enrollments);
  const payments = ds.payments.filter((p) => p.studentId === studentId);
  return {
    service: ds.service,
    enrolled: open != null,
    /** When the stretch still running began; null when not enrolled now. */
    startMonth: open?.startMonth ?? null,
    monthlyPrice: ds.plan.monthlyPrice,
    firstMonth: ds.plan.firstMonth,
    lastMonth: ds.plan.lastMonth,
    currentMonth: monthKey(now),
    /** Null for a student never enrolled this year. */
    summary: enrollments.length
      ? canteenSummary(ds.plan, enrollments, payments, now, skippedMonths(ds, studentId))
      : null,
    /** This student, as the enrolment window lists them — empty while enrolled. */
    candidates: canteenEnrollCandidates(ds).filter((c) => c.id === studentId),
  };
}

export type CanteenStudentCard = NonNullable<ReturnType<typeof canteenStudentCard>>;

export type PreparedCanteenReminder = { studentId: string; label: string; phone: string; message: string };

/** The rappel for one family behind on the canteen, or why there is none. */
export function canteenReminderFor(
  ds: CanteenDataset,
  studentId: string,
  now: Date = new Date()
): PreparedCanteenReminder | { error: string } {
  const info = serviceInfo(ds.service);
  if (!ds.plan) return { error: `${capitalize(info.the)} n'est pas configurée.` };
  const student = ds.students.find((s) => s.id === studentId);
  if (!student) return { error: "Élève introuvable." };
  if (!student.parentPhone) return { error: "Aucun numéro de parent enregistré." };
  const enrollments = ds.enrollments.filter((e) => e.studentId === studentId);
  const summary = canteenSummary(
    ds.plan,
    enrollments,
    ds.payments.filter((p) => p.studentId === studentId),
    now,
    skippedMonths(ds, studentId)
  );
  if (summary.lateMonths.length === 0) return { error: `Cet élève est à jour pour ${info.the}.` };
  return {
    studentId,
    label: `${student.firstName} ${student.lastName}`,
    phone: student.parentPhone,
    message: canteenReminderMessage({
      service: ds.service,
      parentName: student.parentName,
      studentFirstName: student.firstName,
      studentLastName: student.lastName,
      className: student.class.name,
      lateMonths: summary.lateMonths,
      amount: summary.lateAmount,
      schoolName: ds.schoolName,
    }),
  };
}
