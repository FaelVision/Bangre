/*
 * The offline outbox endpoint, `/api/sync`, called the way a device calls it:
 * one queued entry per request, each possibly sent twice when the first answer
 * was lost on a weak connection.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { prisma } from "../../src/lib/db";
import { encryptSession } from "../../src/lib/session";
import { POST } from "../../src/app/api/sync/route";

let schoolId: string;
let classId: string;
let cookie: string;

async function send(entry: Record<string, unknown>) {
  const req = new NextRequest("http://local/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `bangre_session=${cookie}` },
    body: JSON.stringify(entry),
  });
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test("setup: a school with a configured class", async () => {
  const school = await prisma.school.findFirstOrThrow();
  schoolId = school.id;
  const clazz = await prisma.schoolClass.findFirstOrThrow({
    where: { schoolId, tuitionAmount: { not: null }, archived: false },
  });
  classId = clazz.id;
  cookie = await encryptSession({ schoolId });
});

let createdStudentId: string;

test("student.create : rejoué deux fois, un seul élève", async () => {
  const entry = {
    id: "entry-student-1",
    schoolId,
    kind: "student.create",
    payload: { classId, lastName: "Hors-Ligne", firstName: "Rejoué", parentPhone: "70 11 22 99" },
  };
  const first = await send(entry);
  assert.equal(first.body.ok, true, JSON.stringify(first.body));
  const second = await send(entry);
  assert.equal(second.body.ok, true);
  assert.equal(second.body.studentId, first.body.studentId, "la deuxième copie renvoie le même élève");

  const count = await prisma.student.count({ where: { schoolId, lastName: "HORS-LIGNE", firstName: "Rejoué" } });
  assert.equal(count, 1);
  createdStudentId = String(first.body.studentId);
});

test("student.create : un matricule pris entre-temps n'empêche pas l'élève d'arriver", async () => {
  const taken = await prisma.student.findFirstOrThrow({ where: { schoolId }, select: { matricule: true } });
  const res = await send({
    id: "entry-student-2",
    schoolId,
    kind: "student.create",
    payload: { classId, matricule: taken.matricule, lastName: "Conflit", firstName: "Matricule" },
  });
  assert.equal(res.body.ok, true, JSON.stringify(res.body));
  assert.notEqual(res.body.matricule, taken.matricule);
});

test("payment : rejoué deux fois, un seul paiement et un seul numéro de reçu", async () => {
  const entry = {
    id: "entry-payment-1",
    schoolId,
    kind: "payment",
    payload: {
      studentId: createdStudentId,
      mode: "partial",
      trancheIds: [],
      amount: 5000,
      method: "cash",
      date: "2026-09-20",
      receivedBy: "Test",
      notifyWhatsapp: false,
    },
  };
  const counterBefore = (await prisma.school.findUniqueOrThrow({ where: { id: schoolId } })).receiptCounter;

  const first = await send(entry);
  assert.equal(first.body.ok, true, JSON.stringify(first.body));
  const second = await send(entry);
  assert.equal(second.body.ok, true);
  assert.equal(second.body.paymentId, first.body.paymentId);
  assert.equal(second.body.receiptNumber, first.body.receiptNumber);

  assert.equal(await prisma.payment.count({ where: { studentId: createdStudentId } }), 1);
  const counterAfter = (await prisma.school.findUniqueOrThrow({ where: { id: schoolId } })).receiptCounter;
  assert.equal(counterAfter, counterBefore + 1, "le compteur de reçus n'avance qu'une fois");
});

test("reminder.send : rejoué deux fois, un seul rappel enregistré", async () => {
  const entry = {
    id: "entry-reminder-1",
    schoolId,
    kind: "reminder.send",
    studentId: createdStudentId,
    trancheId: null,
    message: "Bonjour, rappel de test.",
  };
  assert.equal((await send(entry)).body.ok, true);
  assert.equal((await send(entry)).body.ok, true);
  assert.equal(await prisma.reminder.count({ where: { studentId: createdStudentId } }), 1);
});

test("une saisie faite pour un autre établissement n'est pas appliquée ici", async () => {
  const res = await send({
    id: "entry-other",
    schoolId: "une-autre-ecole",
    kind: "student.create",
    payload: { classId, lastName: "Autre", firstName: "Ecole" },
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.otherSchool, true);
  assert.equal(await prisma.student.count({ where: { schoolId, lastName: "AUTRE", firstName: "Ecole" } }), 0);
});

test("un élève inconnu est un refus définitif, pas une erreur à réessayer", async () => {
  const res = await send({
    id: "entry-missing",
    schoolId,
    kind: "payment",
    payload: {
      studentId: "local:jamais-synchronise",
      mode: "partial",
      trancheIds: [],
      amount: 1000,
      method: "cash",
      date: "",
      receivedBy: "",
      notifyWhatsapp: false,
    },
  });
  assert.equal(res.body.ok, false);
  assert.equal(res.body.permanent, true);
});

test("teardown", async () => {
  await prisma.$disconnect();
});
