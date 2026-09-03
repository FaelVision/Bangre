import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { computeStudentSummary, studentQueryInclude, type StudentWithPayments } from "@/lib/tuition";

/**
 * Every active student in the school, with their class/tranches/payments
 * loaded and a computed payment summary. Cached per request so the sidebar
 * counts, the dashboard, and the late-payments list can all share one query.
 */
export const getActiveStudentsWithSummary = cache(async (schoolId: string) => {
  const students = (await prisma.student.findMany({
    where: { schoolId, status: "active" },
    include: studentQueryInclude,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })) as StudentWithPayments[];

  const now = new Date();
  return students.map((student) => ({ student, summary: computeStudentSummary(student, now) }));
});

export const getDashboardData = cache(async (schoolId: string) => {
  const rows = await getActiveStudentsWithSummary(schoolId);
  const defined = rows.filter((r) => r.summary.status !== "non_defini");

  const totalExpected = defined.reduce((sum, r) => sum + r.summary.total, 0);
  const totalCollected = defined.reduce((sum, r) => sum + r.summary.paid, 0);
  const totalRemaining = Math.max(0, totalExpected - totalCollected);
  const recoveryPercent = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  const soldeCount = defined.filter((r) => r.summary.paid >= r.summary.total).length;
  const partielCount = defined.filter((r) => r.summary.paid > 0 && r.summary.paid < r.summary.total).length;
  const rienPayeCount = defined.filter((r) => r.summary.paid === 0).length;
  const lateCount = defined.filter((r) => r.summary.status === "retard").length;

  const classes = await prisma.schoolClass.findMany({
    where: { schoolId, archived: false },
    orderBy: { order: "asc" },
  });

  const byClassId = new Map<string, { total: number; paid: number; count: number }>();
  for (const r of defined) {
    const bucket = byClassId.get(r.student.classId) ?? { total: 0, paid: 0, count: 0 };
    bucket.total += r.summary.total;
    bucket.paid += r.summary.paid;
    bucket.count += 1;
    byClassId.set(r.student.classId, bucket);
  }

  const classSummaries = classes.map((c) => {
    const bucket = byClassId.get(c.id);
    const studentCount = rows.filter((r) => r.student.classId === c.id).length;
    const percent = bucket && bucket.total > 0 ? Math.round((bucket.paid / bucket.total) * 100) : null;
    return { class: c, studentCount, percent };
  });

  const recentPayments = await prisma.payment.findMany({
    where: { schoolId },
    orderBy: { date: "desc" },
    take: 5,
    include: { student: { include: { class: true } } },
  });

  return {
    totalExpected,
    totalCollected,
    totalRemaining,
    recoveryPercent,
    soldeCount,
    partielCount,
    rienPayeCount,
    lateCount,
    totalActiveStudents: rows.length,
    // Students whose class has a configured tuition — the population every
    // amount and count above is actually computed on. The rest are invisible
    // to the totals, so the dashboard has to say so rather than imply they
    // are included.
    billedStudentCount: defined.length,
    unbilledStudentCount: rows.length - defined.length,
    classSummaries,
    recentPayments,
  };
});

export type ClassOverview = Awaited<ReturnType<typeof getClassesOverview>>[number];

export const getClassesOverview = cache(async (schoolId: string) => {
  const [classes, rows] = await Promise.all([
    prisma.schoolClass.findMany({ where: { schoolId, archived: false }, orderBy: { order: "asc" } }),
    getActiveStudentsWithSummary(schoolId),
  ]);

  return classes.map((c) => {
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
});

export type StudentsListFilter = {
  classId?: string;
  q?: string;
  statut?: "solde" | "partiel" | "retard" | "attente" | "non_defini";
  page?: number;
};

const PAGE_SIZE = 20;

export const getStudentsList = cache(async (schoolId: string, filter: StudentsListFilter) => {
  const all = await getActiveStudentsWithSummary(schoolId);

  let rows = all;
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
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  return { rows: pageRows, total, page, pageSize: PAGE_SIZE, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
});

export const getStudentDetail = cache(async (schoolId: string, studentId: string) => {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    include: {
      class: { include: { tranches: { orderBy: { order: "asc" } } } },
      payments: {
        include: { allocations: { include: { tranche: true } } },
        orderBy: { date: "desc" },
      },
      reminders: { orderBy: { sentAt: "desc" } },
    },
  });
  if (!student) return null;

  const summary = computeStudentSummary(student as StudentWithPayments);
  return { student, summary };
});

/** WhatsApp reachability buckets used by the late-payments filter. */
export type WhatsappFilter = "injoignable" | "reachable";

/** A parent counts as "à appeler" whenever WhatsApp is not a reliable channel. */
export function isUnreachableOnWhatsapp(whatsappStatus: string) {
  return whatsappStatus !== "reachable";
}

export const getLateStudents = cache(
  async (
    schoolId: string,
    filter: { classId?: string; minDays?: number; whatsapp?: WhatsappFilter } = {}
  ) => {
  const all = await getActiveStudentsWithSummary(schoolId);
  let rows = all.filter((r) => r.summary.status === "retard");

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

  const reminders = await prisma.reminder.findMany({
    where: { studentId: { in: rows.map((r) => r.student.id) } },
    orderBy: { sentAt: "desc" },
  });
  const lastReminderByStudent = new Map<string, (typeof reminders)[number]>();
  for (const r of reminders) {
    if (!lastReminderByStudent.has(r.studentId)) lastReminderByStudent.set(r.studentId, r);
  }

  const reachableCount = rows.filter((r) => r.student.whatsappStatus === "reachable").length;
  const totalDue = rows.reduce((sum, r) => sum + r.summary.overdueAmount, 0);

  return {
    rows: rows.map((r) => ({ ...r, lastReminder: lastReminderByStudent.get(r.student.id) ?? null })),
    reachableCount,
    totalDue,
  };
});

export const getPaymentsOverview = cache(async (schoolId: string, page = 1) => {
  const PAGE_SIZE = 25;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const [total, totalAmount, todayAgg, weekAgg, offlineCount, payments] = await Promise.all([
    prisma.payment.count({ where: { schoolId } }),
    prisma.payment.aggregate({ where: { schoolId }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { schoolId, date: { gte: startOfDay } }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { schoolId, date: { gte: startOfWeek } }, _sum: { amount: true }, _count: true }),
    prisma.payment.count({ where: { schoolId, synced: false } }),
    prisma.payment.findMany({
      where: { schoolId },
      include: { student: { include: { class: true } }, allocations: { include: { tranche: true } } },
      orderBy: { date: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return {
    total,
    totalAmount: totalAmount._sum.amount ?? 0,
    todayAmount: todayAgg._sum.amount ?? 0,
    todayCount: todayAgg._count,
    weekAmount: weekAgg._sum.amount ?? 0,
    weekCount: weekAgg._count,
    offlineCount,
    payments,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
});

export const getPromotionOverview = cache(async (schoolId: string) => {
  const currentYear = await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
  if (!currentYear) return { currentYear: null, pending: [], validatedCount: 0, nextYearExists: false };

  const [pending, validatedCount, nextYear] = await Promise.all([
    prisma.schoolClass.findMany({
      where: { schoolId, academicYearId: currentYear.id, archived: false },
      include: { students: { where: { status: "active" }, select: { id: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.schoolClass.count({ where: { schoolId, academicYearId: currentYear.id, archived: true } }),
    prisma.academicYear.findFirst({ where: { schoolId, isCurrent: false }, orderBy: { createdAt: "desc" } }),
  ]);

  return {
    currentYear,
    pending: pending.map((c) => ({ class: c, studentCount: c.students.length })),
    validatedCount,
    nextYearExists: Boolean(nextYear),
  };
});

export const getSidebarCounts = cache(async (schoolId: string) => {
  const [classesCount, studentsCount, all] = await Promise.all([
    prisma.schoolClass.count({ where: { schoolId, archived: false } }),
    prisma.student.count({ where: { schoolId, status: "active" } }),
    getActiveStudentsWithSummary(schoolId),
  ]);
  const lateCount = all.filter((row) => row.summary.status === "retard").length;
  return { classesCount, studentsCount, lateCount };
});
