/*
 * Revenir en arrière sur la cantine : chaque opération va dans l'historique et
 * s'annule le jour même, en remettant tout comme avant.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../../src/lib/db";
import {
  changeCanteenStart,
  currentAcademicYear,
  enrollInCanteen,
  leaveCanteen,
  persistCanteenPayment,
  setCanteenSkip,
  undoCanteenAction,
} from "../../src/lib/canteen-core";
import { addMonths, monthKey } from "../../src/lib/canteen";

let schoolId: string;
let studentId: string;
let yearId: string;
const thisMonth = monthKey(new Date());
const firstMonth = addMonths(thisMonth, -2);
const lastMonth = addMonths(thisMonth, 6);

async function lastAction(kind: string) {
  return prisma.canteenAction.findFirstOrThrow({ where: { schoolId, studentId, kind }, orderBy: { createdAt: "desc" } });
}

async function pay(months: string[]) {
  return persistCanteenPayment(schoolId, {
    studentId,
    selection: { annual: false, packageIds: [], months },
    date: new Date().toISOString().slice(0, 10),
    method: "cash",
    receivedBy: "Test",
    notifyWhatsapp: false,
  });
}

test("setup: a school running a canteen, a student not enrolled yet", async () => {
  const student = await prisma.student.findFirstOrThrow({ where: { status: "active" }, orderBy: { lastName: "desc" } });
  schoolId = student.schoolId;
  studentId = student.id;
  const year = await currentAcademicYear(schoolId);
  assert.ok(year);
  yearId = year.id;
  for (const model of [prisma.canteenAction, prisma.canteenSkip, prisma.canteenEnrollment, prisma.canteenPayment, prisma.canteenPlan]) {
    await (model as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId } });
  }
  await prisma.canteenPlan.create({
    data: { schoolId, academicYearId: yearId, monthlyPrice: 5000, firstMonth, lastMonth, dueDay: 5 },
  });
  await prisma.school.update({ where: { id: schoolId }, data: { canteenEnabled: true } });
  assert.equal((await enrollInCanteen(schoolId, studentId, firstMonth)).ok, true);
});

test("paiement annulé : reçu gardé et marqué, mois de nouveau dus, numéro non réutilisé", async () => {
  const paid = await pay([firstMonth]);
  assert.ok(paid.ok);
  const before = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { receiptCounter: true } });

  const action = await lastAction("payment");
  assert.equal((await undoCanteenAction(schoolId, action.id, "mauvais élève")).ok, true);

  const payment = await prisma.canteenPayment.findUniqueOrThrow({ where: { id: paid.paymentId } });
  assert.ok(payment.cancelledAt, "le paiement est marqué annulé, pas supprimé");
  assert.equal(payment.cancelReason, "mauvais élève");
  const after = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { receiptCounter: true } });
  assert.equal(after.receiptCounter, before.receiptCounter, "aucun numéro rendu ni réutilisé");

  // The month is owed again: it can be paid, under a new receipt number.
  const again = await pay([firstMonth]);
  assert.ok(again.ok, JSON.stringify(again));
  assert.ok(again.receiptNumber > payment.receiptNumber);
});

test("inscription annulée : refusée tant qu'un paiement la couvre, puis l'élève n'est plus inscrit", async () => {
  const enroll = await lastAction("enroll");
  const blocked = await undoCanteenAction(schoolId, enroll.id);
  assert.equal(blocked.ok, false);
  assert.match(blocked.ok ? "" : blocked.error, /Annulez d'abord le paiement du reçu/);

  await undoCanteenAction(schoolId, (await lastAction("payment")).id);
  assert.equal((await undoCanteenAction(schoolId, enroll.id)).ok, true);
  assert.equal(await prisma.canteenEnrollment.count({ where: { schoolId, studentId } }), 0);

  // A second click changes nothing.
  assert.equal((await undoCanteenAction(schoolId, enroll.id)).ok, true);
});

test("mois sans cantine, sortie et mois de début : chacun revient comme avant", async () => {
  assert.equal((await enrollInCanteen(schoolId, studentId, firstMonth)).ok, true);

  const next = addMonths(thisMonth, 1);
  assert.equal((await setCanteenSkip(schoolId, studentId, next, true)).ok, true);
  assert.equal((await undoCanteenAction(schoolId, (await lastAction("skip")).id)).ok, true);
  assert.equal(await prisma.canteenSkip.count({ where: { studentId, month: next } }), 0);

  assert.equal((await changeCanteenStart(schoolId, studentId, thisMonth)).ok, true);
  assert.equal((await undoCanteenAction(schoolId, (await lastAction("start")).id)).ok, true);
  const enrollment = await prisma.canteenEnrollment.findFirstOrThrow({ where: { schoolId, studentId } });
  assert.equal(enrollment.startMonth, firstMonth);

  assert.equal((await leaveCanteen(schoolId, studentId, thisMonth)).ok, true);
  assert.equal((await undoCanteenAction(schoolId, (await lastAction("leave")).id)).ok, true);
  const reopened = await prisma.canteenEnrollment.findFirstOrThrow({ where: { schoolId, studentId } });
  assert.equal(reopened.endMonth, null, "l'élève mange de nouveau à la cantine");
});

test("mois de début : impossible d'exclure un mois déjà payé", async () => {
  const paid = await pay([firstMonth]);
  assert.ok(paid.ok);
  const res = await changeCanteenStart(schoolId, studentId, thisMonth);
  assert.equal(res.ok, false);
});

test("le jour même seulement : une action d'hier ne s'annule plus", async () => {
  const action = await lastAction("payment");
  await prisma.canteenAction.update({
    where: { id: action.id },
    data: { createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000) },
  });
  const res = await undoCanteenAction(schoolId, action.id);
  assert.equal(res.ok, false);
  assert.match(res.ok ? "" : res.error, /jour même/);
});
