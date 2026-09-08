/**
 * Integration coverage against a real (copied) SQLite DB. Exercises the shared
 * business core the Server Actions and the offline-sync endpoint both call.
 * Not part of `npm test` (which is pure-unit and must not touch a database).
 * Run with `npm run test:integ` — it copies prisma/dev.db to a throwaway file
 * so the demo data is never mutated.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../../src/lib/db";
import { createStudent, updateStudent } from "../../src/lib/students-core";
import { persistPayment } from "../../src/lib/payments-core";
import { sendManualReminder, runSchoolReminders } from "../../src/lib/reminders-core";
import { computeStudentSummary, studentQueryInclude, type StudentWithPayments } from "../../src/lib/tuition";
import { chargeMobileMoney } from "../../src/lib/mobilemoney";

let schoolId: string;
let classWithTuitionId: string;
let classNoTuitionId: string;

test("setup: locate seeded school + classes", async () => {
  const school = await prisma.school.findFirstOrThrow();
  schoolId = school.id;
  const withTuition = await prisma.schoolClass.findFirstOrThrow({
    where: { schoolId, tuitionAmount: { not: null }, archived: false },
    include: { tranches: true },
  });
  classWithTuitionId = withTuition.id;
  const noTuition = await prisma.schoolClass.findFirst({
    where: { schoolId, tuitionAmount: null, archived: false },
  });
  classNoTuitionId = noTuition?.id ?? "";
  assert.ok(schoolId && classWithTuitionId);
});

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

let createdStudentId: string;

test("createStudent: happy path auto-assigns a matricule", async () => {
  const res = await createStudent(schoolId, {
    classId: classWithTuitionId,
    lastName: "  integ-test  ",
    firstName: "Happy",
    parentPhone: "+226 70 00 00 01",
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    createdStudentId = res.studentId;
    assert.match(res.matricule, /^BG-\d+$/);
    const s = await prisma.student.findUniqueOrThrow({ where: { id: res.studentId } });
    assert.equal(s.lastName, "INTEG-TEST", "last name upper-cased + trimmed");
    assert.equal(s.whatsappStatus, "reachable", "phone present => reachable");
  }
});

test("createStudent: rejects missing name", async () => {
  const res = await createStudent(schoolId, { classId: classWithTuitionId, lastName: "", firstName: "" });
  assert.equal(res.ok, false);
});

test("createStudent: rejects duplicate explicit matricule", async () => {
  const existing = await prisma.student.findFirstOrThrow({ where: { schoolId } });
  const res = await createStudent(schoolId, {
    classId: classWithTuitionId,
    lastName: "Dup",
    firstName: "Licate",
    matricule: existing.matricule,
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.error, /déjà utilisé/i);
});

test("createStudent: rejects a class from another school", async () => {
  const res = await createStudent(schoolId, { classId: "does-not-exist", lastName: "X", firstName: "Y" });
  assert.equal(res.ok, false);
});

test("updateStudent: an omitted whatsappStatus no longer downgrades the parent", async () => {
  const before = await prisma.student.findUniqueOrThrow({ where: { id: createdStudentId } });
  assert.equal(before.whatsappStatus, "reachable");
  const res = await updateStudent(schoolId, createdStudentId, {
    classId: before.classId,
    lastName: before.lastName,
    firstName: before.firstName,
    parentPhone: before.parentPhone ?? undefined,
    // whatsappStatus intentionally omitted
  });
  assert.equal(res.ok, true);
  const after = await prisma.student.findUniqueOrThrow({ where: { id: createdStudentId } });
  assert.equal(after.whatsappStatus, "reachable");
});

test("updateStudent: an explicit whatsappStatus still wins", async () => {
  const before = await prisma.student.findUniqueOrThrow({ where: { id: createdStudentId } });
  const res = await updateStudent(schoolId, createdStudentId, {
    classId: before.classId,
    lastName: before.lastName,
    firstName: before.firstName,
    parentPhone: before.parentPhone ?? undefined,
    whatsappStatus: "invalid",
  });
  assert.equal(res.ok, true);
  const after = await prisma.student.findUniqueOrThrow({ where: { id: createdStudentId } });
  assert.equal(after.whatsappStatus, "invalid");
});

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

test("persistPayment: partial mode allocates across tranches in order + numbers the receipt", async () => {
  const student = await prisma.student.findFirstOrThrow({
    where: { classId: classWithTuitionId },
    include: studentQueryInclude,
  });
  const schoolBefore = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });

  const res = await persistPayment(schoolId, {
    studentId: student.id,
    mode: "partial",
    trancheIds: [],
    amount: 1000,
    date: new Date().toISOString(),
    method: "cash",
    receivedBy: "Test",
    notifyWhatsapp: false,
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.receiptNumber, schoolBefore.receiptCounter + 1);
    assert.ok(res.amount > 0 && res.amount <= 1000);
    const allocs = await prisma.paymentAllocation.findMany({ where: { paymentId: res.paymentId } });
    assert.ok(allocs.length >= 1);
  }
});

test("persistPayment: rejects an unconfigured-tuition class", async () => {
  if (!classNoTuitionId) return;
  const s = await createStudent(schoolId, { classId: classNoTuitionId, lastName: "Notuition", firstName: "Kid" });
  assert.equal(s.ok, true);
  if (s.ok) {
    const res = await persistPayment(schoolId, {
      studentId: s.studentId,
      mode: "partial",
      trancheIds: [],
      amount: 5000,
      date: new Date().toISOString(),
      method: "cash",
      receivedBy: "T",
      notifyWhatsapp: false,
    });
    assert.equal(res.ok, false);
  }
});

test("persistPayment: rejects a zero / negative amount", async () => {
  const student = await prisma.student.findFirstOrThrow({ where: { classId: classWithTuitionId } });
  const res = await persistPayment(schoolId, {
    studentId: student.id,
    mode: "partial",
    trancheIds: [],
    amount: 0,
    date: new Date().toISOString(),
    method: "cash",
    receivedBy: "T",
    notifyWhatsapp: false,
  });
  assert.equal(res.ok, false);
});

test("persistPayment: two concurrent payments get distinct receipt numbers", async () => {
  const students = await prisma.student.findMany({ where: { classId: classWithTuitionId }, take: 2 });
  const [a, b] = await Promise.all(
    students.map((s) =>
      persistPayment(schoolId, {
        studentId: s.id,
        mode: "partial",
        trancheIds: [],
        amount: 500,
        date: new Date().toISOString(),
        method: "cash",
        receivedBy: "Race",
        notifyWhatsapp: false,
      })
    )
  );
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) assert.notEqual(a.receiptNumber, b.receiptNumber, "receipt numbers must be unique under concurrency");
});

test("persistPayment: WhatsApp confirmation 'reste à payer' accounts for the enrolment fee", async () => {
  const cls = await prisma.schoolClass.findFirst({
    where: { schoolId, archived: false, tranches: { some: { kind: "registration" } }, tuitionAmount: { not: null } },
    include: { tranches: true },
  });
  if (!cls) return;
  const regFee = cls.tranches.find((t) => t.kind === "registration")!.amount;
  const s = await createStudent(schoolId, {
    classId: cls.id,
    lastName: "Regfee",
    firstName: "Check",
    parentPhone: "+226 70 00 00 09",
  });
  assert.ok(s.ok);
  if (!s.ok) return;

  const tuition = cls.tuitionAmount!;
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.join(" ")); };
  try {
    const res = await persistPayment(schoolId, {
      studentId: s.studentId,
      mode: "partial",
      trancheIds: [],
      amount: tuition, // exactly the tuition — the enrolment fee stays unpaid
      date: new Date().toISOString(),
      method: "cash",
      receivedBy: "T",
      notifyWhatsapp: true,
    });
    assert.ok(res.ok);
  } finally {
    console.log = orig;
  }
  const msg = logs.find((l) => l.includes("[whatsapp:mock]")) ?? "";
  assert.match(msg, /template=confirmation_paiement/, `expected a confirmation_paiement send — got: ${msg}`);
  // params: [montant, élève, classe, date, resteAPayer, école, reçu] — see payments-core.ts.
  const params = JSON.parse(msg.match(/params=(\[.*\])$/)?.[1] ?? "[]") as string[];
  const remaining = params[4];
  assert.notEqual(remaining, "0 CFA", `enrolment fee ${regFee} should still be reported as due — got: ${msg}`);
});

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

test("sendManualReminder: records a reminder row (mock mode)", async () => {
  const late = (await prisma.student.findFirst({
    where: { schoolId, status: "active", parentPhone: { not: null }, classId: classWithTuitionId },
    include: studentQueryInclude,
  })) as StudentWithPayments | null;
  if (!late) return;
  const summary = computeStudentSummary(late);
  const res = await sendManualReminder(schoolId, late.id);
  if (summary.remaining > 0) {
    assert.equal(res.ok, true, JSON.stringify(res));
    if (res.ok) {
      const r = await prisma.reminder.findUniqueOrThrow({ where: { id: res.reminderId } });
      assert.equal(r.trigger, "manual");
    }
  } else {
    assert.equal(res.ok, false);
  }
});

test("sendManualReminder: skips a student with no parent phone", async () => {
  const s = await createStudent(schoolId, { classId: classWithTuitionId, lastName: "Nophone", firstName: "Kid" });
  assert.ok(s.ok);
  if (s.ok) {
    const res = await sendManualReminder(schoolId, s.studentId);
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.skipped, /num[eé]ro/i);
  }
});

test("runSchoolReminders: runs and is idempotent within a single now()", async () => {
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { id: true, name: true } });
  const now = new Date();
  const first = await runSchoolReminders(school, now);
  const second = await runSchoolReminders(school, now);
  assert.equal(second.sent, 0, `second identical run still sent ${second.sent} reminders`);
  console.log(`      first run: considered=${first.considered} sent=${first.sent} failed=${first.failed}`);
});

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

test("chargeMobileMoney: mock mode auto-approves", async () => {
  const res = await chargeMobileMoney("orange_money", "+22670000000", 5000);
  assert.equal(res.ok, true);
  assert.equal(res.mode, "mock");
});

test("teardown", async () => {
  await prisma.$disconnect();
});
