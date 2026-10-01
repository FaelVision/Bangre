import { test } from "node:test";
import assert from "node:assert/strict";
import { describeLines, itemOffered, quoteUniformSale, uniformConfirmationMessage, type UniformItemWithVariants } from "../src/lib/uniforms";
import { uniformSaleContext, uniformsOverview, uniformsToDeliverCount, type UniformDataset } from "../src/lib/uniforms-overview";
import { applyPendingOperations, reviveSnapshot, uniformDataset } from "../src/lib/offline-data";
import type { QueuedEntry } from "../src/lib/offline-queue";

/**
 * Les tenues : le catalogue de l'école (niveaux, tailles, prix, stock
 * facultatif), la vente payée en une fois, la remise.
 */

const NOW = new Date(2026, 9, 15, 10);

function item(
  id: string,
  name: string,
  opts: { levels?: string; trackStock?: boolean; archived?: boolean },
  variants: { id: string; size: string; price: number; stock?: number; archived?: boolean }[]
): UniformItemWithVariants {
  return {
    id,
    schoolId: "school-1",
    name,
    levels: opts.levels ?? "",
    trackStock: opts.trackStock ?? false,
    order: 0,
    archived: opts.archived ?? false,
    createdAt: new Date("2026-09-01"),
    variants: variants.map((v, i) => ({ itemId: id, order: i, stock: 0, archived: false, ...v })),
  };
}

const catalog = [
  item("scol", "Tenue scolaire", { levels: "Maternelle,Primaire", trackStock: true }, [
    { id: "scol-6", size: "6 ans", price: 5000, stock: 3 },
    { id: "scol-8", size: "8 ans", price: 5500, stock: 0 },
  ]),
  item("sport", "Tenue de sport", {}, [{ id: "sport-u", size: "", price: 4000 }]),
  item("old", "Ancienne tenue", { archived: true }, [{ id: "old-u", size: "", price: 3000 }]),
];

test("niveaux : une tenue sans niveau est vendue à tous, sinon seulement aux niveaux choisis", () => {
  assert.equal(itemOffered(catalog[0], "Primaire"), true);
  assert.equal(itemOffered(catalog[0], "Collège"), false);
  assert.equal(itemOffered(catalog[1], "Lycée"), true);
  assert.equal(itemOffered(catalog[2], "Primaire"), false, "une tenue retirée n'est plus vendue");
});

test("prix : selon la taille, quantités additionnées, libellé du reçu", () => {
  const quote = quoteUniformSale(
    catalog,
    [
      { variantId: "scol-6", quantity: 1 },
      { variantId: "sport-u", quantity: 2 },
      { variantId: "scol-6", quantity: 1 },
    ],
    "Primaire"
  );
  assert.ok(quote.ok);
  assert.equal(quote.amount, 2 * 5000 + 2 * 4000);
  assert.equal(describeLines(quote.lines), "2 × Tenue scolaire · 6 ans, 2 × Tenue de sport");
});

test("stock : une taille épuisée ou insuffisante bloque la vente, sauf vente hors ligne rejouée", () => {
  const empty = quoteUniformSale(catalog, [{ variantId: "scol-8", quantity: 1 }], "Primaire");
  assert.ok(!empty.ok);
  assert.match(empty.error, /épuisée/);

  const tooMany = quoteUniformSale(catalog, [{ variantId: "scol-6", quantity: 4 }], "Primaire");
  assert.ok(!tooMany.ok);
  assert.match(tooMany.error, /Il ne reste que 3/);

  assert.ok(quoteUniformSale(catalog, [{ variantId: "scol-8", quantity: 1 }], "Primaire", { ignoreStock: true }).ok);
  // Sans suivi du stock, aucune limite.
  assert.ok(quoteUniformSale(catalog, [{ variantId: "sport-u", quantity: 20 }], "Lycée").ok);
});

test("refus : niveau non concerné, tenue retirée, panier vide", () => {
  const level = quoteUniformSale(catalog, [{ variantId: "scol-6", quantity: 1 }], "Collège");
  assert.ok(!level.ok);
  assert.match(level.error, /n'est pas proposée au niveau/);
  assert.ok(!quoteUniformSale(catalog, [{ variantId: "old-u", quantity: 1 }], "Primaire").ok);
  assert.ok(!quoteUniformSale(catalog, [{ variantId: "sport-u", quantity: 0 }], "Primaire").ok);
});

function dataset(overrides: Partial<UniformDataset> = {}): UniformDataset {
  const student = (id: string, level: string) => ({
    id,
    firstName: "Awa",
    lastName: `K-${id}`,
    matricule: `M-${id}`,
    classId: `c-${level}`,
    status: "active",
    parentPhone: "+22670000000",
    class: { name: level === "Primaire" ? "CP1" : "6e A", level },
  });
  return {
    enabled: true,
    schoolName: "Wend-Panga",
    contactName: "A. Ouédraogo",
    receiptCounter: 10,
    yearLabel: "2026-2027",
    catalog,
    students: [student("p", "Primaire"), student("c", "Collège")],
    sales: [
      {
        id: "sale-1",
        schoolId: "school-1",
        studentId: "p",
        academicYearId: "y",
        amount: 9000,
        method: "cash",
        receivedBy: null,
        date: NOW,
        receiptNumber: 9,
        clientRef: null,
        offlineCreated: false,
        synced: true,
        whatsappNotified: false,
        createdAt: NOW,
        cancelledAt: null,
        cancelReason: null,
        lines: [
          { id: "l1", saleId: "sale-1", itemId: "scol", variantId: "scol-6", label: "Tenue scolaire · 6 ans", quantity: 1, unitPrice: 5000, amount: 5000, deliveredAt: null },
          { id: "l2", saleId: "sale-1", itemId: "sport", variantId: "sport-u", label: "Tenue de sport", quantity: 1, unitPrice: 4000, amount: 4000, deliveredAt: NOW },
        ],
      },
    ],
    online: true,
    ...overrides,
  };
}

test("écran : à remettre, ventes du mois, tailles épuisées, annulation le jour même", () => {
  const ds = dataset();
  assert.equal(uniformsToDeliverCount(ds), 1);
  const overview = uniformsOverview(ds, {}, NOW);
  assert.equal(overview.stats.monthCollected, 9000);
  assert.equal(overview.stats.toDeliver, 1);
  assert.equal(overview.stats.outOfStock, 1, "la taille 8 ans est épuisée");
  assert.equal(overview.sales[0].canCancel, true);
  assert.equal(uniformsOverview(dataset({ online: false }), {}, NOW).sales[0].canCancel, false, "hors ligne : pas d'annulation");
  assert.equal(uniformsOverview(ds, { vue: "a-remettre" }, NOW).sales.length, 1);
});

test("fenêtre de vente : seules les tenues du niveau de l'élève", () => {
  const primaire = uniformSaleContext(dataset(), "p");
  assert.ok(!("error" in primaire));
  assert.deepEqual(primaire.items.map((i) => i.id), ["scol", "sport"]);
  const college = uniformSaleContext(dataset(), "c");
  assert.ok(!("error" in college));
  assert.deepEqual(college.items.map((i) => i.id), ["sport"]);
  assert.ok("error" in uniformSaleContext(dataset({ enabled: false }), "p"));
});

test("hors ligne : une vente baisse le stock local et part en attente de numéro ; la remise s'applique", () => {
  const raw = {
    ok: true,
    syncedAt: NOW.toISOString(),
    school: {
      id: "school-1",
      name: "Wend-Panga",
      contactName: "A",
      city: null,
      type: null,
      receiptCounter: 10,
      subscriptionStatus: "active",
      subscriptionRenewsAt: null,
      blocked: false,
      canteenEnabled: false,
      daycareEnabled: false,
      uniformsEnabled: true,
    },
    academicYear: { id: "y", label: "2026-2027" },
    classes: [
      {
        id: "c-1", schoolId: "school-1", academicYearId: "y", name: "CP1", level: "Primaire", order: 1, tuitionAmount: null,
        registrationFee: null, reminderEnabled: true, reminderBeforeDays: 7, reminderAfterDays: "3,10", reminderHour: "08:00",
        reminderMessageTemplate: null, archived: false, createdAt: NOW.toISOString(), tranches: [],
      },
    ],
    students: [
      {
        id: "p", schoolId: "school-1", classId: "c-1", matricule: "M-p", lastName: "K", firstName: "Awa", birthDate: null,
        gender: null, parentName: null, parentPhone: null, whatsappStatus: "unknown", status: "active", tuitionOverride: null,
        createdAt: NOW.toISOString(),
      },
    ],
    payments: [],
    reminders: [],
    uniforms: { catalog: JSON.parse(JSON.stringify(catalog)), sales: JSON.parse(JSON.stringify(dataset().sales)) },
  };
  const data = reviveSnapshot(raw);
  const entry = (op: Record<string, unknown>, id: string): QueuedEntry =>
    ({ ...op, id, createdAt: NOW.getTime(), label: id, attempts: 0, schoolId: "school-1" }) as unknown as QueuedEntry;
  const local = applyPendingOperations(
    data,
    [
      entry(
        {
          kind: "uniform.sale",
          payload: { studentId: "p", cart: [{ variantId: "scol-6", quantity: 2 }], method: "cash", date: "2026-10-15", receivedBy: "", notifyWhatsapp: false, delivered: false },
        },
        "q-1"
      ),
      entry({ kind: "uniform.deliver", lineIds: ["l1"], delivered: true }, "q-2"),
    ],
    NOW
  );
  const ds = uniformDataset(local);
  assert.equal(ds.catalog[0].variants[0].stock, 1, "3 en stock, 2 vendues");
  assert.equal(data.uniforms.catalog[0].variants[0].stock, 3, "la copie du serveur n'est pas modifiée");
  const offlineSale = ds.sales.find((s) => !s.synced)!;
  assert.equal(offlineSale.receiptNumber, 0);
  assert.equal(offlineSale.amount, 10000);
  assert.equal(uniformsToDeliverCount(ds), 2, "les 2 tenues hors ligne à remettre ; la ligne l1 remise");
});

test("message WhatsApp : tenues et remise à venir", () => {
  const text = uniformConfirmationMessage({
    amount: 9000,
    lines: [{ label: "Tenue scolaire · 6 ans", quantity: 1 }, { label: "Tenue de sport", quantity: 1 }],
    studentFirstName: "Awa",
    studentLastName: "KABORE",
    className: "CP1",
    date: NOW,
    schoolName: "Wend-Panga",
    receiptNumber: 12,
    delivered: false,
  });
  assert.match(text, /pour les tenues de Awa KABORE \(CP1\)/);
  assert.match(text, /1 × Tenue scolaire · 6 ans, 1 × Tenue de sport/);
  assert.match(text, /seront remises/);
});
