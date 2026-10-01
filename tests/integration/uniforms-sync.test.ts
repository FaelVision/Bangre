/*
 * Les tenues en base : vente en ligne (stock bloquant), vente rejouée depuis
 * un poste hors ligne (acceptée même si le stock a filé), remise, annulation
 * du jour qui remet en stock, et catalogue qui archive ce qui a été vendu.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { prisma } from "../../src/lib/db";
import { encryptSession } from "../../src/lib/session";
import { POST } from "../../src/app/api/sync/route";
import { cancelUniformSale, persistUniformSale, setUniformDelivered } from "../../src/lib/uniforms-core";

let schoolId: string;
let cookie: string;
let studentId: string;
let variant6: string;
let variant8: string;

async function send(entry: Record<string, unknown>) {
  const req = new NextRequest("http://local/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `bangre_session=${cookie}` },
    body: JSON.stringify(entry),
  });
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const sale = (variantId: string, quantity: number) => ({
  studentId,
  cart: [{ variantId, quantity }],
  date: new Date().toISOString().slice(0, 10),
  method: "cash",
  receivedBy: "",
  notifyWhatsapp: false,
  delivered: false,
});

test("setup : tenues activées, une tenue suivie en stock (2 en 6 ans, 0 en 8 ans)", async () => {
  const student = await prisma.student.findFirstOrThrow({ where: { status: "active" }, include: { class: true } });
  schoolId = student.schoolId;
  studentId = student.id;
  cookie = await encryptSession({ schoolId });
  await prisma.uniformSaleLine.deleteMany({ where: { sale: { schoolId } } });
  await prisma.uniformSale.deleteMany({ where: { schoolId } });
  await prisma.uniformItem.deleteMany({ where: { schoolId } });
  const item = await prisma.uniformItem.create({
    data: {
      schoolId,
      name: "Tenue scolaire",
      trackStock: true,
      variants: { create: [{ size: "6 ans", price: 5000, stock: 2, order: 0 }, { size: "8 ans", price: 5500, stock: 0, order: 1 }] },
    },
    include: { variants: { orderBy: { order: "asc" } } },
  });
  [variant6, variant8] = item.variants.map((v) => v.id);
  await prisma.school.update({ where: { id: schoolId }, data: { uniformsEnabled: true } });
});

test("en ligne : une taille épuisée est refusée, la vente baisse le stock et prend un numéro", async () => {
  const refused = await persistUniformSale(schoolId, sale(variant8, 1));
  assert.equal(refused.ok, false);

  const before = (await prisma.school.findUniqueOrThrow({ where: { id: schoolId } })).receiptCounter;
  const done = await persistUniformSale(schoolId, sale(variant6, 2));
  assert.ok(done.ok);
  assert.equal(done.amount, 10000);
  assert.equal(done.receiptNumber, before + 1);
  assert.equal((await prisma.uniformVariant.findUniqueOrThrow({ where: { id: variant6 } })).stock, 0);
  assert.equal((await persistUniformSale(schoolId, sale(variant6, 1))).ok, false, "plus de stock");
});

test("hors ligne rejoué : accepté malgré le stock vide, une seule fois", async () => {
  const entry = { id: "u-sale-1", schoolId, kind: "uniform.sale", payload: sale(variant6, 1) };
  const first = await send(entry);
  assert.equal(first.body.ok, true);
  const second = await send(entry);
  assert.equal(second.body.saleId, first.body.saleId, "rejoué : la même vente");
  assert.equal((await prisma.uniformVariant.findUniqueOrThrow({ where: { id: variant6 } })).stock, -1);
});

test("remise, puis annulation du jour qui remet en stock", async () => {
  const s = await prisma.uniformSale.findFirstOrThrow({ where: { schoolId, offlineCreated: false }, include: { lines: true } });
  assert.deepEqual(await setUniformDelivered(schoolId, s.lines.map((l) => l.id), true), { ok: true });
  assert.ok((await prisma.uniformSaleLine.findFirstOrThrow({ where: { saleId: s.id } })).deliveredAt);

  const res = await send({ id: "u-deliver-1", schoolId, kind: "uniform.deliver", lineIds: s.lines.map((l) => l.id), delivered: false });
  assert.equal(res.body.ok, true);
  assert.equal((await prisma.uniformSaleLine.findFirstOrThrow({ where: { saleId: s.id } })).deliveredAt, null);

  assert.deepEqual(await cancelUniformSale(schoolId, s.id, "mauvaise taille"), { ok: true });
  assert.equal((await prisma.uniformVariant.findUniqueOrThrow({ where: { id: variant6 } })).stock, 1, "-1 + 2 remises en stock");
  const cancelled = await prisma.uniformSale.findUniqueOrThrow({ where: { id: s.id } });
  assert.ok(cancelled.cancelledAt);
  assert.equal(cancelled.cancelReason, "mauvaise taille");
});
