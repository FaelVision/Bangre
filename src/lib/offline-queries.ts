import type { Reminder, Tranche } from "@prisma/client";
import { computeStudentSummary, type StudentSummary, type StudentWithPayments } from "@/lib/tuition";
import { findStudentWithPayments, studentsWithPayments, type MirrorData } from "@/lib/offline-data";

/**
 * The same figures the server computes in `queries.ts`, computed on the device
 * from its local copy instead. Every screen renders from one of these, whether
 * the data came from the database or from IndexedDB.
 *
 * Pure and dependency-free so it can be unit-tested without a browser.
 */

export const STUDENTS_PAGE_SIZE = 20;
export const PAYMENTS_PAGE_SIZE = 25;

export type StudentWithClass = StudentWithPayments;
export type StudentRow = { student: StudentWithClass; summary: StudentSummary };

/**
 * Every active student with their situation, in the order the lists show them.
 *
 * The order is French-aware (accents and case where a database collation would
 * differ), so two students with names that only differ by an accent may sit on
 * either side of a page break offline. Everything that counts — the figures,
 * the statuses, who is late — is identical to the server.
 */
export function studentRows(data: MirrorData, now: Date = new Date()): StudentRow[] {
  return studentsWithPayments(data)
    .filter((student) => student.status === "active")
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr"))
    .map((student) => ({ student, summary: computeStudentSummary(student, now) }));
}

export function sidebarCounts(data: MirrorData, now: Date = new Date()) {
  const rows = studentRows(data, now);
  return {
    classesCount: data.classes.filter((c) => !c.archived).length,
    studentsCount: rows.length,
    lateCount: rows.filter((r) => r.summary.status === "retard").length,
  };
}

export function dashboardData(data: MirrorData, now: Date = new Date()) {
  const rows = studentRows(data, now);
  const defined = rows.filter((r) => r.summary.status !== "non_defini");

  const totalExpected = defined.reduce((sum, r) => sum + r.summary.total, 0);
  const totalCollected = defined.reduce((sum, r) => sum + r.summary.paid, 0);
  const totalRemaining = Math.max(0, totalExpected - totalCollected);
  const recoveryPercent = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  const classes = data.classes.filter((c) => !c.archived).sort((a, b) => a.order - b.order);

  const byClassId = new Map<string, { total: number; paid: number }>();
  for (const r of defined) {
    const bucket = byClassId.get(r.student.classId) ?? { total: 0, paid: 0 };
    bucket.total += r.summary.total;
    bucket.paid += r.summary.paid;
    byClassId.set(r.student.classId, bucket);
  }

  const classSummaries = classes.map((c) => {
    const bucket = byClassId.get(c.id);
    return {
      class: c,
      studentCount: rows.filter((r) => r.student.classId === c.id).length,
      percent: bucket && bucket.total > 0 ? Math.round((bucket.paid / bucket.total) * 100) : null,
    };
  });

  const studentById = new Map(rows.map((r) => [r.student.id, r.student]));
  const recentPayments = data.payments
    .filter((p) => studentById.has(p.studentId))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5)
    .map((p) => {
      const student = studentById.get(p.studentId)!;
      return { ...p, student: { ...student, class: student.class } };
    });

  return {
    totalExpected,
    totalCollected,
    totalRemaining,
    recoveryPercent,
    soldeCount: defined.filter((r) => r.summary.paid >= r.summary.total).length,
    partielCount: defined.filter((r) => r.summary.paid > 0 && r.summary.paid < r.summary.total).length,
    rienPayeCount: defined.filter((r) => r.summary.paid === 0).length,
    lateCount: defined.filter((r) => r.summary.status === "retard").length,
    totalActiveStudents: rows.length,
    billedStudentCount: defined.length,
    unbilledStudentCount: rows.length - defined.length,
    classSummaries,
    recentPayments,
  };
}

export function classesOverview(data: MirrorData, now: Date = new Date()) {
  const rows = studentRows(data, now);

  return data.classes
    .filter((c) => !c.archived)
    .sort((a, b) => a.order - b.order)
    .map((c) => {
      const classRows = rows.filter((r) => r.student.classId === c.id);
      const total = classRows.reduce((sum, r) => sum + r.summary.total, 0);
      const paid = classRows.reduce((sum, r) => sum + r.summary.paid, 0);
      const percent = c.tuitionAmount != null && total > 0 ? Math.round((paid / total) * 100) : null;

      let status: "a_jour" | "partiel" | "retard" | "non_definie";
      if (c.tuitionAmount == null) status = "non_definie";
      else if (percent === null) status = "a_jour";
      else if (percent >= 75) status = "a_jour";
      else if (percent >= 40) status = "partiel";
      else status = "retard";

      return { class: c, studentCount: classRows.length, percent, status };
    });
}

export type StudentsListFilter = {
  classId?: string;
  q?: string;
  statut?: StudentSummary["status"];
  page?: number;
};

export function studentsList(data: MirrorData, filter: StudentsListFilter, now: Date = new Date()) {
  let rows = studentRows(data, now);

  if (filter.classId) rows = rows.filter((r) => r.student.classId === filter.classId);
  if (filter.statut) rows = rows.filter((r) => r.summary.status === filter.statut);
  if (filter.q) {
    const q = filter.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.student.firstName.toLowerCase().includes(q) ||
        r.student.lastName.toLowerCase().includes(q) ||
        r.student.matricule.toLowerCase().includes(q)
    );
  }

  const total = rows.length;
  const page = Math.max(1, filter.page ?? 1);
  const start = (page - 1) * STUDENTS_PAGE_SIZE;

  return {
    rows: rows.slice(start, start + STUDENTS_PAGE_SIZE),
    total,
    page,
    pageSize: STUDENTS_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / STUDENTS_PAGE_SIZE)),
  };
}

/** A payment as the student file shows it: each allocation carries its tranche. */
function withTranches(data: MirrorData, studentId: string) {
  const trancheById = new Map<string, Tranche>();
  for (const clazz of data.classes) for (const t of clazz.tranches) trancheById.set(t.id, t);

  return data.payments
    .filter((p) => p.studentId === studentId)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((p) => ({
      ...p,
      allocations: p.allocations
        .map((a) => ({ ...a, tranche: trancheById.get(a.trancheId) }))
        .filter((a): a is typeof a & { tranche: Tranche } => Boolean(a.tranche)),
    }));
}

export function studentDetail(data: MirrorData, studentId: string, now: Date = new Date()) {
  const student = findStudentWithPayments(data, studentId);
  if (!student) return null;

  const reminders = data.reminders
    .filter((r) => r.studentId === studentId)
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());

  return {
    student: {
      ...student,
      class: { ...student.class, tranches: [...student.class.tranches].sort((a, b) => a.order - b.order) },
      payments: withTranches(data, studentId),
      reminders,
    },
    summary: computeStudentSummary(student, now),
  };
}

export type LateFilter = { classId?: string; minDays?: number; whatsapp?: "injoignable" | "reachable" };

/** A parent counts as "à appeler" whenever WhatsApp is not a reliable channel. */
export function isUnreachableOnWhatsapp(whatsappStatus: string) {
  return whatsappStatus !== "reachable";
}

export function lateStudents(data: MirrorData, filter: LateFilter = {}, now: Date = new Date()) {
  let rows = studentRows(data, now).filter((r) => r.summary.status === "retard");

  if (filter.classId) rows = rows.filter((r) => r.student.classId === filter.classId);
  if (filter.minDays) {
    rows = rows.filter((r) => Math.max(...r.summary.overdueTranches.map((t) => t.daysLate)) >= filter.minDays!);
  }
  if (filter.whatsapp === "injoignable") {
    rows = rows.filter((r) => isUnreachableOnWhatsapp(r.student.whatsappStatus));
  } else if (filter.whatsapp === "reachable") {
    rows = rows.filter((r) => !isUnreachableOnWhatsapp(r.student.whatsappStatus));
  }

  rows = rows.sort((a, b) => b.summary.overdueAmount - a.summary.overdueAmount);

  const lastReminderByStudent = new Map<string, Reminder>();
  for (const reminder of [...data.reminders].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())) {
    if (!lastReminderByStudent.has(reminder.studentId)) lastReminderByStudent.set(reminder.studentId, reminder);
  }

  return {
    rows: rows.map((r) => ({ ...r, lastReminder: lastReminderByStudent.get(r.student.id) ?? null })),
    reachableCount: rows.filter((r) => r.student.whatsappStatus === "reachable").length,
    totalDue: rows.reduce((sum, r) => sum + r.summary.overdueAmount, 0),
  };
}

export function paymentsOverview(data: MirrorData, page = 1, now: Date = new Date()) {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const studentById = new Map(studentsWithPayments(data).map((s) => [s.id, s]));
  const trancheById = new Map<string, Tranche>();
  for (const clazz of data.classes) for (const t of clazz.tranches) trancheById.set(t.id, t);

  const all = [...data.payments].sort((a, b) => b.date.getTime() - a.date.getTime());
  const currentPage = Math.max(1, page);
  const start = (currentPage - 1) * PAYMENTS_PAGE_SIZE;

  const payments = all
    .slice(start, start + PAYMENTS_PAGE_SIZE)
    .map((p) => {
      const student = studentById.get(p.studentId);
      if (!student) return null;
      return {
        ...p,
        student: { ...student, class: student.class },
        allocations: p.allocations
          .map((a) => ({ ...a, tranche: trancheById.get(a.trancheId) }))
          .filter((a): a is typeof a & { tranche: Tranche } => Boolean(a.tranche)),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const sum = (rows: typeof all) => rows.reduce((total, p) => total + p.amount, 0);
  const today = all.filter((p) => p.date.getTime() >= startOfDay.getTime());
  const week = all.filter((p) => p.date.getTime() >= startOfWeek.getTime());

  return {
    total: all.length,
    totalAmount: sum(all),
    todayAmount: sum(today),
    todayCount: today.length,
    weekAmount: sum(week),
    weekCount: week.length,
    offlineCount: all.filter((p) => !p.synced).length,
    payments,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(all.length / PAYMENTS_PAGE_SIZE)),
  };
}

/** The payment modal search box, offline: same matching rules as the server action. */
export function searchStudents(data: MirrorData, query: string, limit = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return studentsWithPayments(data)
    .filter((s) => s.status === "active")
    .filter(
      (s) =>
        s.lastName.toLowerCase().includes(q) ||
        s.firstName.toLowerCase().includes(q) ||
        s.matricule.toLowerCase().includes(q)
    )
    .slice(0, limit)
    .map((s) => ({ id: s.id, label: `${s.lastName} ${s.firstName} · ${s.class.name} · ${s.matricule}` }));
}
