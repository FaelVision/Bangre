/**
 * The device must show the same figures as the server.
 *
 * `src/lib/queries.ts` reads the database; `src/lib/offline-queries.ts` reads
 * the copy downloaded onto the device. They are two implementations of one set
 * of rules, so this test builds the snapshot exactly as `/api/offline/snapshot`
 * does, sends it through JSON the way it reaches IndexedDB, and compares every
 * screen against the server side on the seeded database.
 *
 * Run with `npm run test:integ`, which runs the integration files one at a
 * time: every file shares the same copied database, and a file writing rows
 * while this one compares counts would make the comparison race.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../../src/lib/db";
import {
  getActiveStudentsWithSummary,
  getClassesOverview,
  getDashboardData,
  getLateStudents,
  getPaymentsOverview,
  getSidebarCounts,
  getStudentDetail,
  getStudentsList,
} from "../../src/lib/queries";
import { reviveSnapshot, type MirrorData } from "../../src/lib/offline-data";
import {
  classesOverview,
  dashboardData,
  studentRows,
  lateStudents,
  paymentsOverview,
  sidebarCounts,
  studentDetail,
  studentsList,
} from "../../src/lib/offline-queries";

let schoolId: string;
let mirror: MirrorData;

/** The snapshot route, inlined: same queries, same selection. */
async function buildSnapshot(id: string) {
  const [school, academicYear, classes, students, payments, reminders] = await Promise.all([
    prisma.school.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        contactName: true,
        city: true,
        type: true,
        receiptCounter: true,
        subscriptionStatus: true,
        subscriptionRenewsAt: true,
        blocked: true,
      },
    }),
    prisma.academicYear.findFirst({ where: { schoolId: id, isCurrent: true } }),
    prisma.schoolClass.findMany({
      where: { schoolId: id },
      include: { tranches: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    }),
    prisma.student.findMany({ where: { schoolId: id }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.payment.findMany({ where: { schoolId: id }, include: { allocations: true }, orderBy: { date: "desc" } }),
    prisma.reminder.findMany({ where: { schoolId: id }, orderBy: { sentAt: "desc" }, take: 2000 }),
  ]);

  return { syncedAt: new Date().toISOString(), school, academicYear, classes, students, payments, reminders };
}

test("setup: snapshot the seeded school the way the device would", async () => {
  const school = await prisma.school.findFirstOrThrow();
  schoolId = school.id;
  const snapshot = await buildSnapshot(schoolId);
  // JSON.parse(JSON.stringify(...)) is not decoration: it is exactly what the
  // data goes through between the route and IndexedDB, dates included.
  mirror = reviveSnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert.ok(mirror.students.length > 0, "la base de démonstration contient des élèves");
});

test("tableau de bord : mêmes totaux en local et côté serveur", async () => {
  const server = await getDashboardData(schoolId);
  const local = dashboardData(mirror);

  for (const key of [
    "totalExpected",
    "totalCollected",
    "totalRemaining",
    "recoveryPercent",
    "soldeCount",
    "partielCount",
    "rienPayeCount",
    "lateCount",
    "totalActiveStudents",
    "billedStudentCount",
    "unbilledStudentCount",
  ] as const) {
    assert.equal(local[key], server[key], key);
  }

  assert.deepEqual(
    local.classSummaries.map((c) => [c.class.id, c.studentCount, c.percent]),
    server.classSummaries.map((c) => [c.class.id, c.studentCount, c.percent])
  );
  assert.deepEqual(
    local.recentPayments.map((p) => p.id),
    server.recentPayments.map((p) => p.id)
  );
});

test("classes : mêmes pourcentages et mêmes états", async () => {
  const server = await getClassesOverview(schoolId);
  const local = classesOverview(mirror);

  assert.deepEqual(
    local.map((c) => [c.class.id, c.studentCount, c.percent, c.status]),
    server.map((c) => [c.class.id, c.studentCount, c.percent, c.status])
  );
});

test("élèves : mêmes résumés pour chaque élève, mêmes totaux de liste", async () => {
  const server = await getActiveStudentsWithSummary(schoolId);
  const local = studentRows(mirror);

  // Row order is the one thing that may differ: the database sorts with its own
  // collation, the device sorts in French. Compare student by student.
  const serverById = new Map(server.map((r) => [r.student.id, r.summary]));
  assert.equal(local.length, server.length);
  for (const row of local) {
    const expected = serverById.get(row.student.id);
    assert.ok(expected, `élève absent côté serveur : ${row.student.id}`);
    assert.equal(row.summary.status, expected.status, row.student.matricule);
    assert.equal(row.summary.paid, expected.paid, row.student.matricule);
    assert.equal(row.summary.total, expected.total, row.student.matricule);
    assert.equal(row.summary.overdueAmount, expected.overdueAmount, row.student.matricule);
  }

  const serverList = await getStudentsList(schoolId, {});
  const localList = studentsList(mirror, {});
  assert.equal(localList.total, serverList.total);
  assert.equal(localList.pageCount, serverList.pageCount);
  assert.equal(localList.rows.length, serverList.rows.length);

  const serverLate = await getStudentsList(schoolId, { statut: "retard", page: 1 });
  assert.deepEqual(
    studentsList(mirror, { statut: "retard", page: 1 })
      .rows.map((r) => r.student.id)
      .sort(),
    serverLate.rows.map((r) => r.student.id).sort()
  );
});

test("fiche élève : mêmes tranches, mêmes paiements, mêmes rappels", async () => {
  const someone = mirror.students.find((s) => s.status === "active");
  assert.ok(someone);
  const server = await getStudentDetail(schoolId, someone.id);
  const local = studentDetail(mirror, someone.id);
  assert.ok(server && local);

  assert.equal(local.summary.paid, server.summary.paid);
  assert.equal(local.summary.remaining, server.summary.remaining);
  assert.deepEqual(
    local.summary.trancheStates.map((t) => [t.tranche.id, t.paid, t.remaining, t.status]),
    server.summary.trancheStates.map((t) => [t.tranche.id, t.paid, t.remaining, t.status])
  );
  assert.deepEqual(
    local.student.payments.map((p) => [p.id, p.amount, p.allocations.map((a) => a.tranche.label).join(",")]),
    server.student.payments.map((p) => [p.id, p.amount, p.allocations.map((a) => a.tranche.label).join(",")])
  );
  assert.deepEqual(
    local.student.reminders.map((r) => r.id),
    server.student.reminders.map((r) => r.id)
  );
});

test("retards : même liste, même total dû, même dernier rappel", async () => {
  const server = await getLateStudents(schoolId, {});
  const local = lateStudents(mirror, {});

  assert.equal(local.totalDue, server.totalDue);
  assert.equal(local.reachableCount, server.reachableCount);
  assert.deepEqual(
    local.rows.map((r) => [r.student.id, r.summary.overdueAmount, r.lastReminder?.id ?? null]),
    server.rows.map((r) => [r.student.id, r.summary.overdueAmount, r.lastReminder?.id ?? null])
  );
});

test("paiements : mêmes cumuls et même page de journal", async () => {
  const server = await getPaymentsOverview(schoolId, 1);
  const local = paymentsOverview(mirror, 1);

  for (const key of ["total", "totalAmount", "todayAmount", "todayCount", "weekAmount", "weekCount", "offlineCount", "pageCount"] as const) {
    assert.equal(local[key], server[key], key);
  }
  assert.deepEqual(
    local.payments.map((p) => [p.id, p.receiptNumber, p.amount]),
    server.payments.map((p) => [p.id, p.receiptNumber, p.amount])
  );
});

test("barre latérale : mêmes compteurs", async () => {
  const server = await getSidebarCounts(schoolId);
  assert.deepEqual(sidebarCounts(mirror), {
    classesCount: server.classesCount,
    studentsCount: server.studentsCount,
    lateCount: server.lateCount,
  });
});
