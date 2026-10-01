import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import {
  addMonths,
  canteenConfirmationMessage,
  canteenSummary,
  enrolledMonths,
  isMonthKey,
  monthKey,
  monthLabel,
  capitalize,
  openEnrollment,
  quoteCanteenPayment,
  type CanteenPlanWithPackages,
  type CanteenSelection,
} from "@/lib/canteen";
import { canteenLateCount, type CanteenDataset } from "@/lib/canteen-overview";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { formatCFA } from "@/lib/format";
import { undoableToday } from "@/lib/canteen-overview";
import { levelAllowed, parseService, serviceInfo, type SchoolService } from "@/lib/services";

/**
 * Canteen (and garde d'enfants) reads and writes against the database. Shared
 * by the server actions (online) and by `/api/sync` (entries replayed from a
 * device outbox), so a payment or an enrolment made offline goes through the
 * very same checks. Every function works on one service, the canteen unless
 * told otherwise.
 */

/** Rappels older than this only feed the "dernier rappel" column. */
const REMINDERS_LIMIT = 2000;

/** How far back the canteen history goes on screen. Only today's actions can be undone. */
const HISTORY_DAYS = 30;
const HISTORY_LIMIT = 500;

/** The year the school is working in — the one marked current, else the latest. */
export async function currentAcademicYear(schoolId: string) {
  return (
    (await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } })) ??
    (await prisma.academicYear.findFirst({ where: { schoolId }, orderBy: { createdAt: "desc" } }))
  );
}

/** The service's prices for one year. One per service and year: the settings keep it so. */
export async function planFor(
  schoolId: string,
  academicYearId: string,
  service: SchoolService = "canteen"
): Promise<CanteenPlanWithPackages | null> {
  return prisma.canteenPlan.findFirst({
    where: { schoolId, academicYearId, service },
    include: { packages: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
}

function enabledField(service: SchoolService) {
  return service === "daycare" ? "daycareEnabled" : "canteenEnabled";
}

/** Everything the Cantine (or Garde) screens compute from, for the current year. Read once per request. */
export const loadCanteenDataset = cache(
  async (schoolId: string, service: SchoolService = "canteen"): Promise<CanteenDataset> => {
    const [school, year] = await Promise.all([
      prisma.school.findUniqueOrThrow({
        where: { id: schoolId },
        select: { name: true, contactName: true, receiptCounter: true, canteenEnabled: true, daycareEnabled: true },
      }),
      currentAcademicYear(schoolId),
    ]);
    const enabled = school[enabledField(service)];

    const base = {
      service,
      enabled,
      schoolName: school.name,
      contactName: school.contactName,
      receiptCounter: school.receiptCounter,
      yearLabel: year?.label ?? "",
    };
    // Every screen shows nothing of a service that is turned off: skip the
    // whole-school reads for the many schools that never use it.
    if (!enabled) {
      return { ...base, plan: null, students: [], classes: [], enrollments: [], payments: [], reminders: [], skips: [], actions: [] };
    }

    const yearId = year?.id ?? "";
    const [plan, students, classes, enrollments, payments, reminders, skips, actions] = await Promise.all([
      year ? planFor(schoolId, year.id, service) : null,
      prisma.student.findMany({ where: { schoolId }, include: { class: { select: { name: true, level: true } } } }),
      prisma.schoolClass.findMany({
        where: { schoolId, archived: false },
        select: { id: true, name: true, level: true },
        orderBy: { order: "asc" },
      }),
      prisma.canteenEnrollment.findMany({ where: { schoolId, academicYearId: yearId, service } }),
      prisma.canteenPayment.findMany({
        where: { schoolId, academicYearId: yearId, service },
        include: { months: true },
        orderBy: { date: "desc" },
      }),
      prisma.canteenReminder.findMany({
        where: { schoolId, service },
        orderBy: { sentAt: "desc" },
        take: REMINDERS_LIMIT,
      }),
      prisma.canteenSkip.findMany({ where: { schoolId, academicYearId: yearId, service } }),
      prisma.canteenAction.findMany({
        where: { schoolId, service, createdAt: { gte: new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: "desc" },
        take: HISTORY_LIMIT,
      }),
    ]);

    return {
      ...base,
      plan,
      students,
      classes,
      enrollments,
      payments,
      reminders,
      skips,
      actions,
    };
  }
);

/** The sidebar badge: families behind on the service. Nothing to load for a school without it. */
export async function canteenLateCountFor(schoolId: string, service: SchoolService = "canteen") {
  return canteenLateCount(await loadCanteenDataset(schoolId, service));
}

/** The checks every canteen write starts with. */
async function canteenContext(schoolId: string, service: SchoolService) {
  const info = serviceInfo(service);
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { canteenEnabled: true, daycareEnabled: true, name: true },
  });
  if (!school) return { error: "Établissement introuvable." } as const;
  if (!school[enabledField(service)]) {
    return { error: `${capitalize(info.the)} n'est pas activée pour cet établissement.` } as const;
  }
  const year = await currentAcademicYear(schoolId);
  if (!year) return { error: "Aucune année scolaire active." } as const;
  const plan = await planFor(schoolId, year.id, service);
  if (!plan) return { error: `Les tarifs de ${info.the} ne sont pas encore réglés pour cette année.` } as const;
  return { school, year, plan } as const;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type CanteenPaymentInput = {
  /** The canteen when absent — the entries queued before the garde existed. */
  service?: SchoolService;
  studentId: string;
  selection: CanteenSelection;
  date: string;
  method: string;
  receivedBy: string;
  notifyWhatsapp: boolean;
  offlineCreated?: boolean;
  /** Outbox id: a second copy of the same entry returns the payment already recorded. */
  clientRef?: string;
};

export type CanteenPaymentResult =
  | { ok: true; paymentId: string; receiptNumber: number; amount: number; label: string; whatsappUrl: string | null }
  | { ok: false; error: string };

export async function persistCanteenPayment(schoolId: string, input: CanteenPaymentInput): Promise<CanteenPaymentResult> {
  const service = parseService(input.service);
  const info = serviceInfo(service);
  if (input.clientRef) {
    const already = await prisma.canteenPayment.findFirst({
      where: { schoolId, clientRef: input.clientRef },
      select: { id: true, receiptNumber: true, amount: true, label: true },
    });
    if (already) return { ok: true, paymentId: already.id, ...already, whatsappUrl: null };
  }

  const ctx = await canteenContext(schoolId, service);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const { year, plan } = ctx;

  const student = await prisma.student.findFirst({
    where: { id: input.studentId, schoolId },
    include: { class: { select: { name: true } } },
  });
  if (!student) return { ok: false, error: "Élève introuvable." };

  const selection: CanteenSelection = {
    annual: Boolean(input.selection?.annual),
    packageIds: Array.isArray(input.selection?.packageIds) ? input.selection.packageIds.map(String) : [],
    months: Array.isArray(input.selection?.months) ? input.selection.months.map(String) : [],
  };
  const date = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(date.getTime())) return { ok: false, error: "Date invalide." };

  const result = await prisma.$transaction(async (tx) => {
    // Read the student's months inside the transaction: two counters paying
    // the same month at the same moment must not both go through.
    const [enrollments, payments, skips] = await Promise.all([
      tx.canteenEnrollment.findMany({ where: { schoolId, studentId: student.id, academicYearId: year.id, service } }),
      tx.canteenPayment.findMany({
        where: { schoolId, studentId: student.id, academicYearId: year.id, service },
        include: { months: true },
      }),
      tx.canteenSkip.findMany({
        where: { studentId: student.id, academicYearId: year.id, service },
        select: { month: true },
      }),
    ]);
    if (enrollments.length === 0) {
      return { ok: false as const, error: `${student.firstName} ${student.lastName} n'est pas inscrit(e) à ${info.the}.` };
    }
    const quote = quoteCanteenPayment(plan, enrollments, payments, selection, skips.map((k) => k.month));
    if (!quote.ok) return quote;

    const school = await tx.school.update({
      where: { id: schoolId },
      data: { receiptCounter: { increment: 1 } },
    });
    const payment = await tx.canteenPayment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId: year.id,
        service,
        amount: quote.amount,
        label: quote.label,
        method: input.method || "cash",
        receivedBy: input.receivedBy || undefined,
        date,
        receiptNumber: school.receiptCounter,
        clientRef: input.clientRef ?? null,
        offlineCreated: Boolean(input.offlineCreated),
        synced: true,
        months: { create: quote.allocations },
      },
    });
    await recordAction(tx, {
      schoolId,
      studentId: student.id,
      academicYearId: year.id,
      service,
      kind: "payment",
      data: { paymentId: payment.id },
      label: `Paiement ${formatCFA(payment.amount)} · ${payment.label} · reçu N° ${String(payment.receiptNumber).padStart(4, "0")}`,
    });
    return {
      ok: true as const,
      paymentId: payment.id,
      receiptNumber: payment.receiptNumber,
      amount: payment.amount,
      label: payment.label,
      schoolName: school.name,
    };
  });

  if (!result.ok) return result;

  let whatsappUrl: string | null = null;
  if (input.notifyWhatsapp && student.parentPhone) {
    whatsappUrl = buildWhatsAppLink(
      student.parentPhone,
      canteenConfirmationMessage({
        service,
        amount: result.amount,
        label: result.label,
        studentFirstName: student.firstName,
        studentLastName: student.lastName,
        className: student.class.name,
        date,
        schoolName: result.schoolName,
        receiptNumber: result.receiptNumber,
      })
    );
    await prisma.canteenPayment.update({ where: { id: result.paymentId }, data: { whatsappNotified: true } });
  }

  return {
    ok: true,
    paymentId: result.paymentId,
    receiptNumber: result.receiptNumber,
    amount: result.amount,
    label: result.label,
    whatsappUrl,
  };
}

/** What a canteen (or garde) receipt shows, or null when it is not this school's. */
export async function canteenReceipt(schoolId: string, paymentId: string) {
  const payment = await prisma.canteenPayment.findFirst({
    where: { id: paymentId, schoolId },
    include: { student: { include: { class: { select: { name: true } } } } },
  });
  if (!payment) return null;
  const service = parseService(payment.service);
  const own = { schoolId, studentId: payment.studentId, academicYearId: payment.academicYearId, service };

  const [enrollments, payments, plan, skips] = await Promise.all([
    prisma.canteenEnrollment.findMany({ where: own }),
    prisma.canteenPayment.findMany({ where: own, include: { months: true } }),
    planFor(schoolId, payment.academicYearId, service),
    prisma.canteenSkip.findMany({
      where: { studentId: payment.studentId, academicYearId: payment.academicYearId, service },
      select: { month: true },
    }),
  ]);
  const remaining = plan
    ? canteenSummary(plan, enrollments, payments, new Date(), skips.map((k) => k.month)).remainingAmount
    : 0;
  return { payment, service, remaining };
}

// ---------------------------------------------------------------------------
// History — every change, with what it takes to undo it the same day
// ---------------------------------------------------------------------------

type Db = Pick<typeof prisma, "canteenAction">;

export type CanteenActionKind = "payment" | "enroll" | "leave" | "skip" | "start";

async function recordAction(
  db: Db,
  action: {
    schoolId: string;
    studentId: string;
    academicYearId: string;
    service: SchoolService;
    kind: CanteenActionKind;
    data: object;
    label: string;
  }
) {
  await db.canteenAction.create({ data: { ...action, data: JSON.stringify(action.data) } });
}

/** A paid month of a student's year — cancelled payments settle nothing. */
function paidMonthWhere(schoolId: string, studentId: string, academicYearId: string, service: SchoolService) {
  return { payment: { schoolId, studentId, academicYearId, service, cancelledAt: null } };
}

// ---------------------------------------------------------------------------
// Enrolment
// ---------------------------------------------------------------------------

export type CanteenWriteResult = { ok: true } | { ok: false; error: string };

/**
 * Starts a stretch in the service. Safe to receive twice: a student already
 * enrolled stays as they are. A student who left can come back — the new
 * stretch begins after the previous one ended. The garde only takes the
 * pupils of maternelle and primaire classes.
 */
export async function enrollInCanteen(
  schoolId: string,
  studentId: string,
  startMonth?: string | null,
  service: SchoolService = "canteen"
): Promise<CanteenWriteResult> {
  const info = serviceInfo(service);
  const ctx = await canteenContext(schoolId, service);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const { year, plan } = ctx;

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: { id: true, status: true, firstName: true, lastName: true, class: { select: { level: true } } },
  });
  if (!student) return { ok: false, error: "Élève introuvable." };
  if (student.status !== "active") return { ok: false, error: `Seul un élève actif peut être inscrit à ${info.the}.` };

  const enrollments = await prisma.canteenEnrollment.findMany({
    where: { schoolId, studentId, academicYearId: year.id, service },
    orderBy: { startMonth: "asc" },
  });
  if (openEnrollment(enrollments)) return { ok: true };
  if (!levelAllowed(service, student.class.level)) {
    return {
      ok: false,
      error: `${capitalize(info.the)} est réservée aux élèves de maternelle et du primaire (${student.firstName} ${student.lastName} est en ${student.class.level.toLowerCase()}).`,
    };
  }

  let start = isMonthKey(startMonth) ? startMonth : monthKey(new Date());
  if (start < plan.firstMonth) start = plan.firstMonth;
  const lastEnd = enrollments.reduce<string | null>((max, e) => (e.endMonth && (!max || e.endMonth > max) ? e.endMonth : max), null);
  if (lastEnd && start <= lastEnd) start = addMonths(lastEnd, 1);
  if (start > plan.lastMonth) {
    return { ok: false, error: `${capitalize(info.the)} de cette année se termine en ${monthLabel(plan.lastMonth)}.` };
  }

  await prisma.$transaction(async (tx) => {
    const created = await tx.canteenEnrollment.create({
      data: { schoolId, studentId, academicYearId: year.id, service, startMonth: start },
    });
    await recordAction(tx, {
      schoolId,
      studentId,
      academicYearId: year.id,
      service,
      kind: "enroll",
      data: { enrollmentId: created.id },
      label: `${enrollments.length ? "Réinscription" : "Inscription"} dès ${monthLabel(start)}`,
    });
  });
  return { ok: true };
}

/**
 * Ends a student's stretch in the service after `endMonth`, the last month
 * they come. A month already paid cannot be left behind: the school refunds it
 * first, by hand. Ending before the stretch began cancels it altogether.
 */
export async function leaveCanteen(
  schoolId: string,
  studentId: string,
  endMonth: string,
  service: SchoolService = "canteen"
): Promise<CanteenWriteResult> {
  if (!isMonthKey(endMonth)) return { ok: false, error: "Mois invalide." };
  const year = await currentAcademicYear(schoolId);
  if (!year) return { ok: false, error: "Aucune année scolaire active." };

  const enrollments = await prisma.canteenEnrollment.findMany({
    where: { schoolId, studentId, academicYearId: year.id, service },
  });
  const open = openEnrollment(enrollments);
  if (!open) return { ok: true }; // already out — a replayed entry

  const paidAfter = await prisma.canteenPaymentMonth.findMany({
    where: { month: { gt: endMonth, gte: open.startMonth }, ...paidMonthWhere(schoolId, studentId, year.id, service) },
    select: { month: true },
  });
  if (paidAfter.length > 0) {
    const first = paidAfter.map((m) => m.month).sort()[0];
    return {
      ok: false,
      error: `${capitalize(monthLabel(first))} est déjà payé : choisissez un dernier mois qui le comprend.`,
    };
  }

  const cancelled = endMonth < open.startMonth;
  await prisma.$transaction(async (tx) => {
    if (cancelled) await tx.canteenEnrollment.delete({ where: { id: open.id } });
    else await tx.canteenEnrollment.update({ where: { id: open.id }, data: { endMonth } });
    await recordAction(tx, {
      schoolId,
      studentId,
      academicYearId: year.id,
      service,
      kind: "leave",
      data: { enrollmentId: open.id, startMonth: open.startMonth, endMonth, cancelled },
      label: cancelled ? "Inscription annulée" : `Sortie de ${serviceInfo(service).the} après ${monthLabel(endMonth)}`,
    });
  });
  return { ok: true };
}

/**
 * Moves the first month of the student's current stretch — "inscrit depuis
 * novembre, pas octobre". A paid month cannot be left out of it, and the
 * stretch cannot reach back into a previous one.
 */
export async function changeCanteenStart(
  schoolId: string,
  studentId: string,
  startMonth: string,
  options: { record?: boolean; service?: SchoolService } = {}
): Promise<CanteenWriteResult> {
  const service = options.service ?? "canteen";
  const info = serviceInfo(service);
  if (!isMonthKey(startMonth)) return { ok: false, error: "Mois invalide." };
  const year = await currentAcademicYear(schoolId);
  if (!year) return { ok: false, error: "Aucune année scolaire active." };
  const plan = await planFor(schoolId, year.id, service);
  if (!plan) return { ok: false, error: `Les tarifs de ${info.the} ne sont pas encore réglés pour cette année.` };

  const enrollments = await prisma.canteenEnrollment.findMany({
    where: { schoolId, studentId, academicYearId: year.id, service },
  });
  const current = openEnrollment(enrollments);
  if (!current) return { ok: false, error: `Cet élève n'est pas inscrit à ${info.the} en ce moment.` };
  if (current.startMonth === startMonth) return { ok: true };

  if (startMonth < plan.firstMonth || startMonth > plan.lastMonth) {
    return { ok: false, error: `${capitalize(info.the)} va de ${monthLabel(plan.firstMonth)} à ${monthLabel(plan.lastMonth)}.` };
  }
  const previousEnd = enrollments
    .filter((e) => e.id !== current.id && e.endMonth)
    .reduce<string | null>((max, e) => (!max || e.endMonth! > max ? e.endMonth! : max), null);
  if (previousEnd && startMonth <= previousEnd) {
    return { ok: false, error: `L'élève était déjà inscrit jusqu'à ${monthLabel(previousEnd)} : choisissez un mois après.` };
  }
  if (startMonth > current.startMonth) {
    const paidBefore = await prisma.canteenPaymentMonth.findFirst({
      where: { month: { gte: current.startMonth, lt: startMonth }, ...paidMonthWhere(schoolId, studentId, year.id, service) },
      select: { month: true },
    });
    if (paidBefore) {
      return { ok: false, error: `${capitalize(monthLabel(paidBefore.month))} est déjà payé : l'inscription doit le comprendre.` };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.canteenEnrollment.update({ where: { id: current.id }, data: { startMonth } });
    if (options.record !== false) {
      await recordAction(tx, {
        schoolId,
        studentId,
        academicYearId: year.id,
        service,
        kind: "start",
        data: { enrollmentId: current.id, from: current.startMonth, to: startMonth },
        label: `Début de ${info.noun} : ${monthLabel(current.startMonth)} → ${monthLabel(startMonth)}`,
      });
    }
  });
  return { ok: true };
}

/**
 * Marks a month "sans cantine" (or "sans garde") for a student, or takes the
 * mark off. Setting the state it already has changes nothing, so a replayed
 * entry is harmless. A paid month cannot be marked: the school refunds it first.
 */
export async function setCanteenSkip(
  schoolId: string,
  studentId: string,
  month: string,
  skipped: boolean,
  options: { record?: boolean; service?: SchoolService } = {}
): Promise<CanteenWriteResult> {
  const service = options.service ?? "canteen";
  const info = serviceInfo(service);
  if (!isMonthKey(month)) return { ok: false, error: "Mois invalide." };
  const year = await currentAcademicYear(schoolId);
  if (!year) return { ok: false, error: "Aucune année scolaire active." };
  const record = options.record !== false;
  const existing = await prisma.canteenSkip.findMany({
    where: { studentId, academicYearId: year.id, month, service },
    select: { id: true },
  });

  if (!skipped) {
    if (existing.length === 0) return { ok: true };
    await prisma.$transaction(async (tx) => {
      await tx.canteenSkip.deleteMany({ where: { id: { in: existing.map((k) => k.id) } } });
      if (record) {
        await recordAction(tx, {
          schoolId,
          studentId,
          academicYearId: year.id,
          service,
          kind: "skip",
          data: { month, skipped: false },
          label: `${capitalize(monthLabel(month))} remis à ${info.the}`,
        });
      }
    });
    return { ok: true };
  }

  if (existing.length > 0) return { ok: true };
  const plan = await planFor(schoolId, year.id, service);
  if (!plan) return { ok: false, error: `Les tarifs de ${info.the} ne sont pas encore réglés pour cette année.` };
  const enrollments = await prisma.canteenEnrollment.findMany({
    where: { schoolId, studentId, academicYearId: year.id, service },
  });
  if (!enrolledMonths(plan, enrollments).includes(month)) {
    return { ok: false, error: `${capitalize(monthLabel(month))} ne fait pas partie de l'inscription de cet élève.` };
  }
  const paid = await prisma.canteenPaymentMonth.findFirst({
    where: { month, ...paidMonthWhere(schoolId, studentId, year.id, service) },
    select: { id: true },
  });
  if (paid) return { ok: false, error: `${capitalize(monthLabel(month))} est déjà payé.` };

  await prisma.$transaction(async (tx) => {
    await tx.canteenSkip.create({ data: { schoolId, studentId, academicYearId: year.id, service, month } });
    if (record) {
      await recordAction(tx, {
        schoolId,
        studentId,
        academicYearId: year.id,
        service,
        kind: "skip",
        data: { month, skipped: true },
        label: `${capitalize(monthLabel(month))} ${info.without}`,
      });
    }
  });
  return { ok: true };
}

/**
 * Puts a student's canteen (or garde) back the way it was before one action.
 * Allowed the day the action was made. When a later change depends on it (a
 * payment on the months of an enrolment), that change must be undone first —
 * the message says which.
 */
export async function undoCanteenAction(schoolId: string, actionId: string, reason?: string): Promise<CanteenWriteResult> {
  const action = await prisma.canteenAction.findFirst({ where: { id: actionId, schoolId } });
  if (!action) return { ok: false, error: "Action introuvable." };
  if (action.undoneAt) return { ok: true }; // already undone — a second click
  if (!undoableToday(action.createdAt)) {
    return { ok: false, error: "Une action ne peut être annulée que le jour même." };
  }

  const data = JSON.parse(action.data) as Record<string, unknown>;
  const { studentId, academicYearId } = action;
  const service = parseService(action.service);
  const why = reason?.trim() || null;
  let result: CanteenWriteResult = { ok: true };

  switch (action.kind as CanteenActionKind) {
    case "payment": {
      const payment = await prisma.canteenPayment.findFirst({ where: { id: String(data.paymentId), schoolId } });
      if (payment && !payment.cancelledAt) {
        await prisma.canteenPayment.update({
          where: { id: payment.id },
          data: { cancelledAt: new Date(), cancelReason: why },
        });
      }
      break;
    }

    case "enroll": {
      const enrollment = await prisma.canteenEnrollment.findFirst({ where: { id: String(data.enrollmentId), schoolId } });
      if (!enrollment) break; // already gone
      const months = enrollment.endMonth
        ? { gte: enrollment.startMonth, lte: enrollment.endMonth }
        : { gte: enrollment.startMonth };
      const paid = await prisma.canteenPaymentMonth.findFirst({
        where: { month: months, ...paidMonthWhere(schoolId, studentId, academicYearId, service) },
        include: { payment: { select: { receiptNumber: true } } },
      });
      if (paid) {
        result = {
          ok: false,
          error: `Annulez d'abord le paiement du reçu N° ${String(paid.payment.receiptNumber).padStart(4, "0")} : il couvre ${monthLabel(paid.month)}.`,
        };
        break;
      }
      await prisma.$transaction([
        prisma.canteenSkip.deleteMany({ where: { studentId, academicYearId, service, month: months } }),
        prisma.canteenEnrollment.delete({ where: { id: enrollment.id } }),
      ]);
      break;
    }

    case "leave": {
      const startMonth = String(data.startMonth);
      const others = (
        await prisma.canteenEnrollment.findMany({ where: { schoolId, studentId, academicYearId, service } })
      ).filter((e) => e.id !== data.enrollmentId);
      // Re-enrolled since: that new stretch would overlap the one put back.
      const later = others.find((e) => e.startMonth >= startMonth || e.endMonth == null);
      if (later) {
        result = {
          ok: false,
          error: `L'élève a été réinscrit depuis (dès ${monthLabel(later.startMonth)}) : annulez d'abord cette réinscription.`,
        };
        break;
      }
      if (data.cancelled) {
        await prisma.canteenEnrollment.create({ data: { schoolId, studentId, academicYearId, service, startMonth } });
      } else {
        const reopened = await prisma.canteenEnrollment.updateMany({
          where: { id: String(data.enrollmentId), schoolId },
          data: { endMonth: null },
        });
        if (reopened.count === 0) {
          result = { ok: false, error: "Cette inscription a été annulée depuis : réinscrivez l'élève." };
        }
      }
      break;
    }

    case "skip":
      result = await setCanteenSkip(schoolId, studentId, String(data.month), !data.skipped, { record: false, service });
      break;

    case "start":
      result = await changeCanteenStart(schoolId, studentId, String(data.from), { record: false, service });
      break;
  }

  if (!result.ok) return result;
  await prisma.canteenAction.update({ where: { id: action.id }, data: { undoneAt: new Date(), undoReason: why } });
  return { ok: true };
}

export async function recordCanteenReminder(
  schoolId: string,
  studentId: string,
  message: string,
  service: SchoolService = "canteen"
) {
  const reminder = await prisma.canteenReminder.create({ data: { schoolId, studentId, message, service } });
  return { ok: true as const, reminderId: reminder.id };
}
