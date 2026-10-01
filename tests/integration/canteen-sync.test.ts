/*
 * The canteen through `/api/sync`, the way a device replays its outbox: each
 * entry may arrive twice when the first answer was lost on a weak connection.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { prisma } from "../../src/lib/db";
import { encryptSession } from "../../src/lib/session";
import { POST } from "../../src/app/api/sync/route";
import { currentAcademicYear } from "../../src/lib/canteen-core";
import { monthKey } from "../../src/lib/canteen";

let schoolId: string;
let studentId: string;
let cookie: string;
let firstMonth: string;

async function send(entry: Record<string, unknown>) {
  const req = new NextRequest("http://local/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `bangre_session=${cookie}` },
    body: JSON.stringify(entry),
  });
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test("setup: a school running a canteen, a student not enrolled yet", async () => {
  const student = await prisma.student.findFirstOrThrow({ where: { status: "active" } });
  schoolId = student.schoolId;
  studentId = student.id;
  cookie = await encryptSession({ schoolId });

  const year = await currentAcademicYear(schoolId);
  assert.ok(year);
  // A period that has started, so the student's first month is already owed.
  firstMonth = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const lastMonth = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() + 6, 1));

  await prisma.canteenPlan.deleteMany({ where: { schoolId } });
  await prisma.canteenEnrollment.deleteMany({ where: { schoolId } });
  await prisma.canteenPayment.deleteMany({ where: { schoolId } });
  await prisma.canteenPlan.create({
    data: { schoolId, academicYearId: year.id, monthlyPrice: 5000, firstMonth, lastMonth, dueDay: 5 },
  });
  await prisma.school.update({ where: { id: schoolId }, data: { canteenEnabled: true } });
});

test("canteen.enroll : rejoué deux fois, une seule inscription", async () => {
  const entry = { id: "canteen-enroll-1", schoolId, kind: "canteen.enroll", studentId, startMonth: firstMonth };
  assert.equal((await send(entry)).body.ok, true);
  assert.equal((await send(entry)).body.ok, true);
  const enrollments = await prisma.canteenEnrollment.findMany({ where: { schoolId, studentId } });
  assert.equal(enrollments.length, 1);
  assert.equal(enrollments[0].startMonth, firstMonth);
});

test("canteen.payment : rejoué deux fois, un seul reçu", async () => {
  const before = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { receiptCounter: true } });
  const entry = {
    id: "canteen-pay-1",
    schoolId,
    kind: "canteen.payment",
    payload: {
      studentId,
      selection: { annual: false, packageIds: [], months: [firstMonth] },
      method: "cash",
      date: new Date().toISOString().slice(0, 10),
      receivedBy: "Test",
      notifyWhatsapp: false,
    },
  };
  const first = await send(entry);
  assert.equal(first.body.ok, true, JSON.stringify(first.body));
  const second = await send(entry);
  assert.equal(second.body.paymentId, first.body.paymentId, "la deuxième copie renvoie le même paiement");

  const payments = await prisma.canteenPayment.findMany({ where: { schoolId, studentId }, include: { months: true } });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].amount, 5000);
  assert.equal(payments[0].offlineCreated, true);
  assert.deepEqual(payments[0].months.map((m) => m.month), [firstMonth]);

  const after = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { receiptCounter: true } });
  assert.equal(after.receiptCounter, before.receiptCounter + 1, "numbered in the school's single receipt sequence");
});

test("canteen.payment : un mois déjà payé est refusé pour de bon", async () => {
  const res = await send({
    id: "canteen-pay-2",
    schoolId,
    kind: "canteen.payment",
    payload: {
      studentId,
      selection: { annual: false, packageIds: [], months: [firstMonth] },
      method: "cash",
      date: "",
      receivedBy: "",
      notifyWhatsapp: false,
    },
  });
  assert.equal(res.body.ok, false);
  assert.equal(res.body.permanent, true);
});

test("canteen.skip : mois sans cantine, rejoué deux fois, puis retiré ; un mois payé est refusé", async () => {
  const next = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1));
  const mark = { id: "skip-1", schoolId, kind: "canteen.skip", studentId, month: next, skipped: true };
  assert.equal((await send(mark)).body.ok, true);
  assert.equal((await send(mark)).body.ok, true);
  assert.equal(await prisma.canteenSkip.count({ where: { studentId, month: next } }), 1);

  // A skipped month cannot be paid.
  const pay = await send({
    id: "canteen-pay-skip",
    schoolId,
    kind: "canteen.payment",
    payload: {
      studentId,
      selection: { annual: false, packageIds: [], months: [next] },
      method: "cash",
      date: "",
      receivedBy: "",
      notifyWhatsapp: false,
    },
  });
  assert.equal(pay.body.ok, false);

  assert.equal((await send({ ...mark, id: "skip-2", skipped: false })).body.ok, true);
  assert.equal(await prisma.canteenSkip.count({ where: { studentId, month: next } }), 0);

  const onPaid = await send({ id: "skip-3", schoolId, kind: "canteen.skip", studentId, month: firstMonth, skipped: true });
  assert.equal(onPaid.body.ok, false);
  assert.equal(onPaid.body.permanent, true);
});

test("canteen.leave : impossible de laisser derrière un mois payé, puis sortie acceptée", async () => {
  const before = await send({ id: "leave-1", schoolId, kind: "canteen.leave", studentId, endMonth: "2000-01" });
  assert.equal(before.body.ok, false);
  assert.equal(before.body.permanent, true);

  const ok = await send({ id: "leave-2", schoolId, kind: "canteen.leave", studentId, endMonth: firstMonth });
  assert.equal(ok.body.ok, true);
  const again = await send({ id: "leave-2", schoolId, kind: "canteen.leave", studentId, endMonth: firstMonth });
  assert.equal(again.body.ok, true, "already out: the replay changes nothing");
  const enrollment = await prisma.canteenEnrollment.findFirstOrThrow({ where: { schoolId, studentId } });
  assert.equal(enrollment.endMonth, firstMonth);
});

test("canteen.reminder : rejoué deux fois, un seul rappel", async () => {
  const entry = { id: "canteen-rem-1", schoolId, kind: "canteen.reminder", studentId, message: "Rappel cantine test" };
  assert.equal((await send(entry)).body.ok, true);
  assert.equal((await send(entry)).body.ok, true);
  assert.equal(await prisma.canteenReminder.count({ where: { schoolId, message: "Rappel cantine test" } }), 1);
});

test("canteen désactivée : un paiement rejoué est refusé", async () => {
  await prisma.school.update({ where: { id: schoolId }, data: { canteenEnabled: false } });
  const res = await send({
    id: "canteen-pay-3",
    schoolId,
    kind: "canteen.payment",
    payload: {
      studentId,
      selection: { annual: false, packageIds: [], months: [firstMonth] },
      method: "cash",
      date: "",
      receivedBy: "",
      notifyWhatsapp: false,
    },
  });
  assert.equal(res.body.ok, false);
});
