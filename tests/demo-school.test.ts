import test from "node:test";
import assert from "node:assert/strict";

import { buildDemoDataset, academicYearLabel, DEMO_RENEWAL_DATE } from "../src/lib/demo-dataset";
import { PERMANENT_RENEWAL_DATE } from "../src/lib/subscription-core";
import { computeStudentSummary, type StudentWithPayments } from "../src/lib/tuition";
import { canteenOverview, type CanteenDataset } from "../src/lib/canteen-overview";

/**
 * The demonstration school is shown to prospects, so what matters is not just
 * that it loads: every screen must have something worth looking at — argent
 * encaissé aujourd'hui, élèves soldés, retards, parents à appeler.
 */

const NOW = new Date("2026-09-25T10:00:00.000Z");

/** Rebuilds what the app computes for each student, straight from the dataset. */
function summaries(now = NOW) {
  const dataset = buildDemoDataset(now, idFactory());
  const classById = new Map(dataset.classes.map((c) => [c.id, c]));
  const tranchesByClass = new Map<string, (typeof dataset.tranches)[number][]>();
  for (const tranche of dataset.tranches) {
    const list = tranchesByClass.get(tranche.classId);
    if (list) list.push(tranche);
    else tranchesByClass.set(tranche.classId, [tranche]);
  }
  const allocationsByPayment = new Map<string, (typeof dataset.allocations)[number][]>();
  for (const allocation of dataset.allocations) {
    const list = allocationsByPayment.get(allocation.paymentId);
    if (list) list.push(allocation);
    else allocationsByPayment.set(allocation.paymentId, [allocation]);
  }

  const rows = dataset.students.map((student) => {
    const clazz = classById.get(student.classId)!;
    const payments = dataset.payments
      .filter((p) => p.studentId === student.id)
      .map((p) => ({ ...p, allocations: allocationsByPayment.get(p.id) ?? [] }));

    const asPrisma = {
      ...student,
      tuitionOverride: null,
      class: { ...clazz, tranches: tranchesByClass.get(student.classId) ?? [] },
      payments,
    } as unknown as StudentWithPayments;

    return { student, summary: computeStudentSummary(asPrisma, now) };
  });

  return { dataset, rows };
}

function idFactory() {
  let n = 0;
  return () => `demo-${++n}`;
}

test("le jeu de démonstration tient dans une présentation", () => {
  const { dataset } = summaries();
  assert.equal(dataset.classes.length, 8);
  assert.equal(dataset.students.length, 120);
  assert.ok(dataset.payments.length > 150, `${dataset.payments.length} paiements`);
  assert.equal(dataset.academicYearLabel, "2026-2027");
});

test("deux réinitialisations donnent exactement la même école", () => {
  const first = buildDemoDataset(NOW, idFactory());
  const second = buildDemoDataset(NOW, idFactory());
  assert.deepEqual(
    first.students.map((s) => [s.matricule, s.lastName, s.firstName, s.parentPhone]),
    second.students.map((s) => [s.matricule, s.lastName, s.firstName, s.parentPhone])
  );
  assert.deepEqual(
    first.payments.map((p) => [p.receiptNumber, p.amount]),
    second.payments.map((p) => [p.receiptNumber, p.amount])
  );
});

test("chaque situation est représentée : soldé, partiel, retard, non défini", () => {
  const { rows } = summaries();
  const count = (status: string) => rows.filter((r) => r.summary.status === status).length;

  assert.ok(count("solde") >= 30, `soldés : ${count("solde")}`);
  assert.ok(count("partiel") >= 15, `partiels : ${count("partiel")}`);
  assert.ok(count("retard") >= 20, `retards : ${count("retard")}`);
  // La classe sans montant de scolarité : c'est elle qui déclenche l'invite
  // « ces élèves ne sont pas comptés dans les totaux » du tableau de bord.
  assert.equal(count("non_defini"), 12);

  const rienPaye = rows.filter((r) => r.summary.status !== "non_defini" && r.summary.paid === 0).length;
  assert.ok(rienPaye >= 5, `rien payé : ${rienPaye}`);
});

test("les écrans de caisse ne sont jamais vides le jour de la démo", () => {
  const { dataset } = summaries();
  const startOfDay = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const today = dataset.payments.filter((p) => p.date.getTime() >= startOfDay.getTime());
  const week = dataset.payments.filter((p) => p.date.getTime() >= startOfWeek.getTime());
  assert.ok(today.length > 0, "encaissé aujourd'hui");
  assert.ok(week.length >= today.length, "encaissé cette semaine");

  // Les reçus — scolarité et cantine, une seule série — sont numérotés dans
  // l'ordre de l'argent reçu, sans trou.
  const all = [...dataset.payments, ...dataset.canteen.payments].sort((a, b) => a.receiptNumber - b.receiptNumber);
  assert.deepEqual(
    all.map((p) => p.receiptNumber),
    Array.from({ length: all.length }, (_, i) => i + 1)
  );
  const dates = all.map((p) => p.date.getTime());
  assert.deepEqual(dates, [...dates].sort((a, b) => a - b));
});

test("il y a des parents à appeler et des rappels déjà envoyés", () => {
  const { dataset } = summaries();
  const unreachable = dataset.students.filter((s) => s.whatsappStatus !== "reachable");
  assert.ok(unreachable.length >= 5, `injoignables : ${unreachable.length}`);
  assert.ok(
    dataset.students.some((s) => s.parentPhone === null),
    "au moins un parent sans numéro"
  );
  assert.ok(dataset.reminders.length >= 5, `rappels : ${dataset.reminders.length}`);
});

test("la démo suit la date du jour et ne périme jamais", () => {
  assert.equal(academicYearLabel(new Date("2027-01-15T00:00:00.000Z")), "2026-2027");
  assert.equal(academicYearLabel(new Date("2027-09-02T00:00:00.000Z")), "2027-2028");

  // Les échéances sont relatives à « maintenant » : une démo faite dans six
  // mois montre des retards frais, pas un historique figé.
  const later = new Date("2027-03-01T10:00:00.000Z");
  const { rows } = summaries(later);
  assert.ok(rows.some((r) => r.summary.status === "retard"));
  assert.ok(rows.some((r) => r.summary.status === "solde"));

  // Même sentinelle « permanent » que l'abonnement, sans importer le module
  // server-only depuis la ligne de commande.
  assert.equal(DEMO_RENEWAL_DATE.getTime(), PERMANENT_RENEWAL_DATE.getTime());
});

/** The Cantine tab of the demo school, as the app would compute it. */
function canteenOf(now: Date) {
  const dataset = buildDemoDataset(now, idFactory());
  const c = dataset.canteen;
  const classById = new Map(dataset.classes.map((cl) => [cl.id, cl]));
  const year = { schoolId: "demo", academicYearId: "year" };
  const ds: CanteenDataset = {
    enabled: true,
    schoolName: "Démo",
    contactName: "A. Ouédraogo",
    receiptCounter: dataset.payments.length + c.payments.length,
    yearLabel: dataset.academicYearLabel,
    plan: { ...c.plan, ...year, createdAt: now, packages: c.packages },
    students: dataset.students.map((st) => ({
      ...st,
      status: "active",
      class: { name: classById.get(st.classId)!.name },
    })),
    classes: dataset.classes.map((cl) => ({ id: cl.id, name: cl.name })),
    enrollments: c.enrollments.map((e) => ({ ...e, ...year })),
    payments: c.payments.map((p) => ({
      ...p,
      ...year,
      clientRef: null,
      offlineCreated: false,
      synced: true,
      whatsappNotified: false,
      cancelledAt: null,
      cancelReason: null,
      months: c.paymentMonths.filter((m) => m.paymentId === p.id),
    })),
    reminders: c.reminders.map((r) => ({ ...r, schoolId: "demo" })),
    skips: c.skips.map((k) => ({ ...k, ...year })),
    actions: c.actions.map((a) => ({ ...a, ...year, undoneAt: null, undoReason: null })),
  };
  return { dataset, ds };
}

test("cantine : chaque façon de payer est montrée en milieu d'année", () => {
  const now = new Date("2027-01-15T10:00:00.000Z");
  const { dataset, ds } = canteenOf(now);
  const c = dataset.canteen;
  const overview = canteenOverview(ds, {}, now);

  assert.ok(overview.stats.enrolledCount >= 25, `inscrits : ${overview.stats.enrolledCount}`);
  assert.ok(overview.stats.lateCount >= 3, `en retard : ${overview.stats.lateCount}`);
  assert.ok(c.payments.some((p) => p.label.startsWith("Année complète")), "un paiement annuel");
  assert.ok(c.payments.some((p) => p.label.includes("trimestre")), "des forfaits trimestre");
  assert.ok(c.payments.some((p) => /^[A-ZÉ][a-zéû]+ 20\d\d$/.test(p.label)), "des mois à l'unité");
  assert.ok(c.skips.length >= 1, "des mois sans cantine");
  assert.ok(c.enrollments.some((e) => e.endMonth), "un élève sorti");
  assert.ok(c.enrollments.some((e) => e.startMonth > c.plan.firstMonth), "un élève arrivé en cours d'année");
  assert.ok(c.reminders.length >= 1, "des rappels de cantine envoyés");

  // Un paiement du jour, annulable depuis l'historique pendant la présentation.
  const today = canteenOverview(ds, { vue: "historique" }, now).history.filter((h) => h.canUndo);
  assert.ok(today.some((h) => h.kind === "payment"), "un paiement annulable aujourd'hui");
});

test("cantine : en début d'année, la démo tient debout", () => {
  const { dataset, ds } = canteenOf(NOW);
  assert.ok(dataset.canteen.enrollments.length >= 25);
  assert.ok(dataset.canteen.payments.every((p) => p.date.getTime() <= NOW.getTime()), "rien dans le futur");
  // Septembre est échu le 5 : la démo montre déjà ses premiers retards.
  assert.ok(canteenOverview(ds, {}, NOW).stats.lateCount >= 1, "des retards dès la fin septembre");
  const again = buildDemoDataset(NOW, idFactory());
  assert.deepEqual(
    dataset.canteen.payments.map((p) => [p.receiptNumber, p.amount, p.label]),
    again.canteen.payments.map((p) => [p.receiptNumber, p.amount, p.label]),
    "deux réinitialisations donnent la même cantine"
  );
});
