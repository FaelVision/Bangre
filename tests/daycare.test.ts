import { test } from "node:test";
import assert from "node:assert/strict";
import { canteenConfirmationMessage, canteenReminderMessage } from "../src/lib/canteen";
import { applyPendingOperations, canteenDataset, reviveSnapshot } from "../src/lib/offline-data";
import {
  canteenEnrollCandidates,
  canteenOverview,
  canteenPaymentContext,
  canteenReminderFor,
  canteenStudentCard,
} from "../src/lib/canteen-overview";
import { levelAllowed, parseService } from "../src/lib/services";
import type { QueuedEntry } from "../src/lib/offline-queue";

/**
 * La garde d'enfants : les règles de la cantine (au mois, en forfaits, à
 * l'année), sur ses propres tarifs et inscriptions, réservée aux élèves de
 * maternelle et du primaire.
 */

const NOW = new Date(2026, 11, 10, 10); // 10 décembre 2026

function plan(id: string, service: string, monthlyPrice: number) {
  return {
    id,
    schoolId: "school-1",
    academicYearId: "year-1",
    service,
    monthlyPrice,
    annualPrice: null,
    firstMonth: "2026-10",
    lastMonth: "2027-06",
    dueDay: 5,
    createdAt: "2026-09-01T00:00:00.000Z",
    packages: [
      { id: `${id}-t1`, planId: id, label: "1er trimestre", months: "2026-10,2026-11,2026-12", price: monthlyPrice * 3 - 1000, order: 0 },
    ],
  };
}

function klass(id: string, name: string, level: string, order: number) {
  return {
    id,
    schoolId: "school-1",
    academicYearId: "year-1",
    name,
    level,
    order,
    tuitionAmount: null,
    registrationFee: null,
    reminderEnabled: true,
    reminderBeforeDays: 7,
    reminderAfterDays: "3,10",
    reminderHour: "08:00",
    reminderMessageTemplate: null,
    archived: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    tranches: [],
  };
}

function student(id: string, classId: string, lastName: string, firstName: string) {
  return {
    id,
    schoolId: "school-1",
    classId,
    matricule: `M-${id}`,
    lastName,
    firstName,
    birthDate: null,
    gender: null,
    parentName: "Parent",
    parentPhone: "+22670000000",
    whatsappStatus: "reachable",
    status: "active",
    tuitionOverride: null,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function enrollment(id: string, studentId: string, service: string) {
  return {
    id,
    schoolId: "school-1",
    studentId,
    academicYearId: "year-1",
    service,
    startMonth: "2026-10",
    endMonth: null,
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

function snapshot() {
  return {
    ok: true,
    syncedAt: "2026-12-10T09:00:00.000Z",
    school: {
      id: "school-1",
      name: "Groupe scolaire Wend-Panga",
      contactName: "Awa OUEDRAOGO",
      city: null,
      type: null,
      receiptCounter: 40,
      subscriptionStatus: "active",
      subscriptionRenewsAt: "2027-12-31T00:00:00.000Z",
      blocked: false,
      canteenEnabled: true,
      daycareEnabled: true,
    },
    academicYear: { id: "year-1", label: "2026-2027" },
    classes: [
      klass("c-ms", "Moyenne section", "Maternelle", 1),
      klass("c-cp1", "CP1", "Primaire", 2),
      klass("c-6e", "6e A", "Collège", 3),
    ],
    students: [
      student("s-ms", "c-ms", "KABORE", "Awa"),
      student("s-cp", "c-cp1", "SAWADOGO", "Issa"),
      student("s-6e", "c-6e", "ZONGO", "Moussa"),
    ],
    payments: [],
    reminders: [],
    canteen: {
      plan: plan("plan-c", "canteen", 5000),
      enrollments: [enrollment("ce-1", "s-6e", "canteen")],
      payments: [],
      reminders: [],
      skips: [],
    },
    daycare: {
      plan: plan("plan-g", "daycare", 7500),
      enrollments: [enrollment("ge-1", "s-ms", "daycare")],
      payments: [],
      reminders: [],
      skips: [],
    },
  };
}

function entry(op: Record<string, unknown>, id: string, createdAt = NOW.getTime()): QueuedEntry {
  return { ...op, id, createdAt, label: id, attempts: 0, schoolId: "school-1" } as unknown as QueuedEntry;
}

test("niveaux : la garde est réservée à la maternelle et au primaire, la cantine ouverte à tous", () => {
  assert.equal(levelAllowed("daycare", "Maternelle"), true);
  assert.equal(levelAllowed("daycare", "Primaire"), true);
  assert.equal(levelAllowed("daycare", "Collège"), false);
  assert.equal(levelAllowed("daycare", "Lycée"), false);
  assert.equal(levelAllowed("canteen", "Lycée"), true);
  assert.equal(parseService("daycare"), "daycare");
  assert.equal(parseService(undefined), "canteen", "les entrées d'avant la garde restent la cantine");
});

test("garde et cantine ne se mélangent pas : tarifs, inscrits et retards propres", () => {
  const data = reviveSnapshot(snapshot());
  const garde = canteenOverview(canteenDataset(data, "daycare"), {}, NOW);
  const cantine = canteenOverview(canteenDataset(data, "canteen"), {}, NOW);

  assert.equal(garde.service, "daycare");
  assert.equal(garde.plan?.monthlyPrice, 7500);
  assert.deepEqual(garde.rows.map((r) => r.student.id), ["s-ms"]);
  assert.equal(garde.stats.lateAmount, 3 * 7500, "octobre à décembre en retard, au prix de la garde");

  assert.equal(cantine.plan?.monthlyPrice, 5000);
  assert.deepEqual(cantine.rows.map((r) => r.student.id), ["s-6e"]);

  // Les classes proposées en filtre : celles que la garde accepte.
  assert.deepEqual(garde.classes.map((c) => c.id), ["c-ms", "c-cp1"]);
  assert.equal(cantine.classes.length, 3);
});

test("inscription à la garde : seuls les élèves de maternelle et du primaire sont proposés", () => {
  const data = reviveSnapshot(snapshot());
  const candidates = canteenEnrollCandidates(canteenDataset(data, "daycare"));
  assert.deepEqual(candidates.map((c) => c.id), ["s-cp"], "Awa est déjà gardée, Moussa est au collège");

  const cantine = canteenEnrollCandidates(canteenDataset(data, "canteen"));
  assert.deepEqual(cantine.map((c) => c.id).sort(), ["s-cp", "s-ms"]);
});

test("fiche élève : pas de carte garde pour un collégien jamais inscrit", () => {
  const ds = canteenDataset(reviveSnapshot(snapshot()), "daycare");
  assert.equal(canteenStudentCard(ds, "s-6e", NOW), null);
  const issa = canteenStudentCard(ds, "s-cp", NOW);
  assert.ok(issa);
  assert.equal(issa.service, "daycare");
  assert.equal(issa.enrolled, false);
  assert.deepEqual(issa.candidates.map((c) => c.id), ["s-cp"]);
});

test("hors ligne : une inscription à la garde d'un collégien n'est pas appliquée, celle d'un élève de CP l'est", () => {
  const local = applyPendingOperations(
    reviveSnapshot(snapshot()),
    [
      entry({ kind: "canteen.enroll", studentId: "s-6e", startMonth: "2026-12", service: "daycare" }, "q-1"),
      entry({ kind: "canteen.enroll", studentId: "s-cp", startMonth: "2026-12", service: "daycare" }, "q-2", NOW.getTime() + 1),
    ],
    NOW
  );
  assert.deepEqual(local.daycare.enrollments.map((e) => e.studentId).sort(), ["s-cp", "s-ms"]);
  assert.equal(local.daycare.enrollments.find((e) => e.studentId === "s-cp")?.service, "daycare");
  assert.deepEqual(local.canteen.enrollments.map((e) => e.studentId), ["s-6e"], "la cantine est intacte");
});

test("hors ligne : un paiement de garde (forfait) va à la garde, un paiement sans service à la cantine", () => {
  const payment = (studentId: string, selection: object, service?: string) => ({
    kind: "canteen.payment",
    payload: { service, studentId, selection, method: "cash", date: "2026-12-10", receivedBy: "", notifyWhatsapp: false },
  });
  const local = applyPendingOperations(
    reviveSnapshot(snapshot()),
    [
      entry(payment("s-ms", { annual: false, packageIds: ["plan-g-t1"], months: [] }, "daycare"), "q-1"),
      entry(payment("s-6e", { annual: false, packageIds: [], months: ["2026-10"] }), "q-2", NOW.getTime() + 1),
    ],
    NOW
  );
  assert.equal(local.daycare.payments.length, 1);
  assert.equal(local.daycare.payments[0].amount, 7500 * 3 - 1000);
  assert.equal(local.daycare.payments[0].service, "daycare");
  assert.equal(local.canteen.payments.length, 1);
  assert.equal(local.canteen.payments[0].amount, 5000);

  const awa = canteenOverview(canteenDataset(local, "daycare"), {}, NOW).rows[0];
  assert.equal(awa.summary.status, "a_jour");
});

test("messages : la garde parle de garde, pas de cantine", () => {
  const ds = canteenDataset(reviveSnapshot(snapshot()), "daycare");
  const rappel = canteenReminderFor(ds, "s-ms", NOW);
  assert.ok(!("error" in rappel));
  assert.match(rappel.message, /la garde de Awa KABORE/);
  assert.doesNotMatch(rappel.message, /cantine/);

  const context = canteenPaymentContext(ds, "s-cp", NOW);
  assert.ok("error" in context);
  assert.match(context.error, /n'est pas inscrit\(e\) à la garde/);

  const confirmation = canteenConfirmationMessage({
    service: "daycare",
    amount: 7500,
    label: "Décembre 2026",
    studentFirstName: "Awa",
    studentLastName: "KABORE",
    className: "Moyenne section",
    date: NOW,
    schoolName: "Wend-Panga",
    receiptNumber: 41,
  });
  assert.match(confirmation, /pour la garde de Awa KABORE/);
  assert.match(
    canteenReminderMessage({
      parentName: null,
      studentFirstName: "Ali",
      studentLastName: "K",
      className: "CM1",
      lateMonths: ["2026-10"],
      amount: 5000,
      schoolName: "X",
    }),
    /la cantine de Ali/,
    "sans service : la cantine, comme avant"
  );
});
