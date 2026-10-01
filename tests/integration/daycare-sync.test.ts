/*
 * La garde d'enfants à travers `/api/sync`, comme un poste rejoue sa file : à
 * côté de la cantine, sur les mêmes tables, sans jamais s'y mélanger, et
 * réservée aux élèves de maternelle et du primaire.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { prisma } from "../../src/lib/db";
import { encryptSession } from "../../src/lib/session";
import { POST } from "../../src/app/api/sync/route";
import {
  canteenReceipt,
  currentAcademicYear,
  loadCanteenDataset,
  setCanteenSkip,
  undoCanteenAction,
} from "../../src/lib/canteen-core";
import { monthKey } from "../../src/lib/canteen";
import { canteenOverview } from "../../src/lib/canteen-overview";

let schoolId: string;
let cookie: string;
let littleId: string; // maternelle
let olderId: string; // collège
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

test("setup : une école avec cantine et garde, une classe de maternelle et une de collège", async () => {
  const first = await prisma.student.findFirstOrThrow({ where: { status: "active" } });
  schoolId = first.schoolId;
  cookie = await encryptSession({ schoolId });
  const year = await currentAcademicYear(schoolId);
  assert.ok(year);

  const classes = await prisma.schoolClass.findMany({
    where: { schoolId, archived: false, students: { some: { status: "active" } } },
    include: { students: { where: { status: "active" }, take: 1 } },
    orderBy: { order: "asc" },
  });
  assert.ok(classes.length >= 2, "deux classes avec des élèves");
  // La copie de la base est jetable : on fixe les niveaux dont le test a besoin.
  await prisma.schoolClass.update({ where: { id: classes[0].id }, data: { level: "Maternelle" } });
  await prisma.schoolClass.update({ where: { id: classes[1].id }, data: { level: "Collège" } });
  littleId = classes[0].students[0].id;
  olderId = classes[1].students[0].id;

  firstMonth = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const lastMonth = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() + 6, 1));
  for (const model of [prisma.canteenAction, prisma.canteenSkip, prisma.canteenPayment, prisma.canteenEnrollment, prisma.canteenPlan]) {
    await (model as typeof prisma.canteenPlan).deleteMany({ where: { schoolId } });
  }
  await prisma.canteenPlan.create({
    data: { schoolId, academicYearId: year.id, service: "canteen", monthlyPrice: 5000, firstMonth, lastMonth, dueDay: 5 },
  });
  await prisma.canteenPlan.create({
    data: { schoolId, academicYearId: year.id, service: "daycare", monthlyPrice: 8000, firstMonth, lastMonth, dueDay: 5 },
  });
  await prisma.school.update({ where: { id: schoolId }, data: { canteenEnabled: true, daycareEnabled: true } });
});

test("garde : un collégien est refusé, définitivement", async () => {
  const res = await send({ id: "g-enroll-0", schoolId, kind: "canteen.enroll", service: "daycare", studentId: olderId, startMonth: firstMonth });
  assert.equal(res.status, 400);
  assert.equal(res.body.permanent, true);
  assert.match(String(res.body.error), /maternelle et du primaire/);
  assert.equal(await prisma.canteenEnrollment.count({ where: { schoolId, studentId: olderId } }), 0);
});

test("garde : l'élève de maternelle est inscrit, la cantine ne bouge pas", async () => {
  const entry = { id: "g-enroll-1", schoolId, kind: "canteen.enroll", service: "daycare", studentId: littleId, startMonth: firstMonth };
  assert.equal((await send(entry)).body.ok, true);
  assert.equal((await send(entry)).body.ok, true, "rejoué : rien de plus");
  const rows = await prisma.canteenEnrollment.findMany({ where: { schoolId, studentId: littleId } });
  assert.deepEqual(rows.map((r) => r.service), ["daycare"]);

  // Le même élève peut aussi prendre la cantine : deux inscriptions distinctes.
  const canteen = { id: "c-enroll-1", schoolId, kind: "canteen.enroll", studentId: littleId, startMonth: firstMonth };
  assert.equal((await send(canteen)).body.ok, true);
  const both = await prisma.canteenEnrollment.findMany({ where: { schoolId, studentId: littleId }, orderBy: { service: "asc" } });
  assert.deepEqual(both.map((r) => r.service), ["canteen", "daycare"]);
});

test("garde : paiement au prix de la garde, reçu dans la même numérotation", async () => {
  const before = (await prisma.school.findUniqueOrThrow({ where: { id: schoolId } })).receiptCounter;
  const res = await send({
    id: "g-pay-1",
    schoolId,
    kind: "canteen.payment",
    payload: {
      service: "daycare",
      studentId: littleId,
      selection: { annual: false, packageIds: [], months: [firstMonth] },
      method: "cash",
      date: new Date().toISOString().slice(0, 10),
      receivedBy: "",
      notifyWhatsapp: false,
    },
  });
  assert.equal(res.body.ok, true);
  assert.equal(res.body.amount, 8000);
  assert.equal(res.body.receiptNumber, before + 1);

  const receipt = await canteenReceipt(schoolId, String(res.body.paymentId));
  assert.equal(receipt?.service, "daycare");

  const garde = canteenOverview(await loadCanteenDataset(schoolId, "daycare"), {});
  const cantine = canteenOverview(await loadCanteenDataset(schoolId, "canteen"), {});
  const little = (o: typeof garde) => o.rows.find((r) => r.student.id === littleId)!;
  assert.equal(little(garde).summary.months[0].status, "paid");
  assert.equal(little(cantine).summary.months[0].status, "late", "la cantine du même mois reste due");
});

test("garde : un mois sans garde s'annule le jour même, sans toucher la cantine", async () => {
  const month = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() + 2, 1));
  assert.deepEqual(await setCanteenSkip(schoolId, littleId, month, true, { service: "daycare" }), { ok: true });
  assert.deepEqual(await setCanteenSkip(schoolId, littleId, month, true, { service: "canteen" }), { ok: true });

  const action = await prisma.canteenAction.findFirstOrThrow({
    where: { schoolId, studentId: littleId, service: "daycare", kind: "skip" },
    orderBy: { createdAt: "desc" },
  });
  assert.match(action.label, /sans garde/);
  assert.deepEqual(await undoCanteenAction(schoolId, action.id), { ok: true });

  const skips = await prisma.canteenSkip.findMany({ where: { schoolId, studentId: littleId, month } });
  assert.deepEqual(skips.map((k) => k.service), ["canteen"]);
});
