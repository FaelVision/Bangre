import test from "node:test";
import assert from "node:assert/strict";

import {
  addMonths,
  annualAvailable,
  availablePackages,
  canteenMonthStates,
  canteenPricing,
  canteenSummary,
  describeMonths,
  enrolledMonths,
  monthRange,
  priceCanteenSelection,
  quoteCanteenPayment,
  type CanteenPlanWithPackages,
} from "../src/lib/canteen";
import { applyPendingOperations, canteenDataset, reviveSnapshot } from "../src/lib/offline-data";
import { canteenOverview, canteenPaymentContext, canteenReminderFor } from "../src/lib/canteen-overview";
import type { QueuedEntry } from "../src/lib/offline-queue";

/**
 * The canteen rules, shared by the server and the device: which months a
 * student owes, which are late, and what a selection of months costs.
 */

const plan: CanteenPlanWithPackages = {
  id: "plan-1",
  schoolId: "school-1",
  academicYearId: "year-1",
  service: "canteen",
  monthlyPrice: 5000,
  annualPrice: 40000,
  firstMonth: "2026-10",
  lastMonth: "2027-06",
  dueDay: 5,
  createdAt: new Date("2026-09-01"),
  packages: [
    { id: "t1", planId: "plan-1", label: "1er trimestre", months: "2026-10,2026-11,2026-12", price: 14000, order: 0 },
    { id: "t2", planId: "plan-1", label: "2e trimestre", months: "2027-01,2027-02,2027-03", price: 14000, order: 1 },
  ],
};

const wholeYear = [{ startMonth: "2026-10", endMonth: null }];
const paid = (...months: string[]) => [{ months: months.map((month) => ({ month, amount: 5000 })) }];

test("months: ranges, arithmetic across a year end, wording", () => {
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2027-01", -1), "2026-12");
  assert.deepEqual(monthRange("2026-11", "2027-01"), ["2026-11", "2026-12", "2027-01"]);
  assert.equal(describeMonths(["2026-12", "2026-10", "2026-11"]), "octobre à décembre 2026");
  assert.equal(describeMonths(["2026-12", "2027-01", "2027-03"]), "décembre 2026 à janvier 2027, mars 2027");
});

test("enrolment: a mid-year start owes only from that month, a gap is not owed", () => {
  assert.deepEqual(enrolledMonths(plan, [{ startMonth: "2027-04", endMonth: null }]), ["2027-04", "2027-05", "2027-06"]);
  const twoStretches = [
    { startMonth: "2026-10", endMonth: "2026-11" },
    { startMonth: "2027-05", endMonth: null },
  ];
  assert.deepEqual(enrolledMonths(plan, twoStretches), ["2026-10", "2026-11", "2027-05", "2027-06"]);
});

test("states: late past the due day, due before it, upcoming later, paid whatever the date", () => {
  const now = new Date(2026, 11, 3, 10); // 3 décembre 2026: December not yet late (due the 5th)
  const states = canteenMonthStates(plan, wholeYear, paid("2026-10"), now);
  const byMonth = Object.fromEntries(states.map((s) => [s.month, s.status]));
  assert.equal(byMonth["2026-10"], "paid");
  assert.equal(byMonth["2026-11"], "late");
  assert.equal(byMonth["2026-12"], "due");
  assert.equal(byMonth["2027-01"], "upcoming");

  const summary = canteenSummary(plan, wholeYear, paid("2026-10"), now);
  assert.deepEqual(summary.lateMonths, ["2026-11"]);
  assert.equal(summary.lateAmount, 5000);
  assert.equal(summary.remainingAmount, 8 * 5000);
  assert.equal(summary.status, "retard");
});

test("pricing: single months at the monthly price", () => {
  const quote = quoteCanteenPayment(plan, wholeYear, [], { annual: false, packageIds: [], months: ["2026-11", "2026-10"] });
  assert.ok(quote.ok);
  assert.equal(quote.amount, 10000);
  assert.equal(quote.label, "Octobre à novembre 2026");
  assert.deepEqual(quote.allocations.map((a) => a.month), ["2026-10", "2026-11"]);
});

test("pricing: a package and extra months together, the package spread to the franc", () => {
  const pricing = canteenPricing({ ...plan, packages: [{ ...plan.packages[0], price: 14001 }] }, wholeYear, []);
  const quote = priceCanteenSelection(pricing, { annual: false, packageIds: ["t1"], months: ["2027-01", "2026-10"] });
  assert.ok(quote.ok);
  // 2026-10 is in the package: not charged twice.
  assert.equal(quote.amount, 14001 + 5000);
  assert.equal(quote.label, "1er trimestre + janvier 2027");
  const total = quote.allocations.reduce((s, a) => s + a.amount, 0);
  assert.equal(total, quote.amount);
  assert.deepEqual(
    quote.allocations.filter((a) => a.month < "2027-01").map((a) => a.amount),
    [4667, 4667, 4667]
  );
});

test("pricing: the annual price only for a student owing the whole year", () => {
  const fresh = canteenPricing(plan, wholeYear, []);
  assert.equal(annualAvailable(fresh), true);
  const annual = priceCanteenSelection(fresh, { annual: true, packageIds: [], months: [] });
  assert.ok(annual.ok);
  assert.equal(annual.amount, 40000);
  assert.equal(annual.allocations.length, 9);

  assert.equal(annualAvailable(canteenPricing(plan, wholeYear, paid("2026-10"))), false);
  assert.equal(annualAvailable(canteenPricing(plan, [{ startMonth: "2026-11", endMonth: null }], [])), false);
  const refused = quoteCanteenPayment(plan, wholeYear, paid("2026-10"), { annual: true, packageIds: [], months: [] });
  assert.equal(refused.ok, false);
});

test("pricing: a paid month, a month outside the enrolment or an overlapping package is refused", () => {
  assert.equal(
    quoteCanteenPayment(plan, wholeYear, paid("2026-10"), { annual: false, packageIds: [], months: ["2026-10"] }).ok,
    false
  );
  assert.equal(
    quoteCanteenPayment(plan, [{ startMonth: "2027-01", endMonth: null }], [], {
      annual: false,
      packageIds: [],
      months: ["2026-12"],
    }).ok,
    false
  );
  // A package whose month was already paid no longer applies.
  assert.equal(
    quoteCanteenPayment(plan, wholeYear, paid("2026-11"), { annual: false, packageIds: ["t1"], months: [] }).ok,
    false
  );
  assert.deepEqual(
    availablePackages(canteenPricing(plan, wholeYear, paid("2026-11"))).map((p) => p.id),
    ["t2"]
  );
  assert.equal(quoteCanteenPayment(plan, wholeYear, [], { annual: false, packageIds: [], months: [] }).ok, false);
});

// ---------------------------------------------------------------------------
// On the device
// ---------------------------------------------------------------------------

function snapshot() {
  return {
    ok: true,
    syncedAt: "2026-12-10T09:00:00.000Z",
    school: {
      id: "school-1",
      name: "École Wend-Panga",
      contactName: "Awa OUEDRAOGO",
      city: null,
      type: null,
      receiptCounter: 40,
      subscriptionStatus: "active",
      subscriptionRenewsAt: "2027-12-31T00:00:00.000Z",
      blocked: false,
      canteenEnabled: true,
    },
    academicYear: { id: "year-1", label: "2026-2027" },
    classes: [
      {
        id: "class-1",
        schoolId: "school-1",
        academicYearId: "year-1",
        name: "CM1",
        level: "Primaire",
        order: 1,
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
      },
    ],
    students: [
      student("s-1", "KABORE", "Ali", "70000001"),
      student("s-2", "SAWADOGO", "Fatou", "70000002"),
      student("s-3", "ZONGO", "Issa", null),
    ],
    payments: [],
    reminders: [],
    canteen: {
      plan: { ...plan, createdAt: "2026-09-01T00:00:00.000Z" },
      enrollments: [
        { id: "e-1", schoolId: "school-1", studentId: "s-1", academicYearId: "year-1", startMonth: "2026-10", endMonth: null, createdAt: "2026-10-01T00:00:00.000Z" },
        { id: "e-2", schoolId: "school-1", studentId: "s-2", academicYearId: "year-1", startMonth: "2026-10", endMonth: null, createdAt: "2026-10-01T00:00:00.000Z" },
      ],
      payments: [
        {
          id: "cp-1",
          schoolId: "school-1",
          studentId: "s-2",
          academicYearId: "year-1",
          amount: 14000,
          label: "1er trimestre",
          method: "cash",
          receivedBy: null,
          date: "2026-10-02T09:00:00.000Z",
          receiptNumber: 12,
          clientRef: null,
          offlineCreated: false,
          synced: true,
          whatsappNotified: false,
          months: [
            { id: "m1", paymentId: "cp-1", month: "2026-10", amount: 4667 },
            { id: "m2", paymentId: "cp-1", month: "2026-11", amount: 4667 },
            { id: "m3", paymentId: "cp-1", month: "2026-12", amount: 4666 },
          ],
        },
      ],
      reminders: [],
    },
  };
}

function student(id: string, lastName: string, firstName: string, phone: string | null) {
  return {
    id,
    schoolId: "school-1",
    classId: "class-1",
    matricule: `M-${id}`,
    lastName,
    firstName,
    birthDate: null,
    gender: null,
    parentName: null,
    parentPhone: phone ? `+226${phone}` : null,
    whatsappStatus: phone ? "reachable" : "unknown",
    status: "active",
    tuitionOverride: null,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

const NOW = new Date(2026, 11, 10, 10); // 10 décembre 2026

function entry(op: Record<string, unknown>, id: string, createdAt = NOW.getTime()): QueuedEntry {
  return { ...op, id, createdAt, label: id, attempts: 0, schoolId: "school-1" } as unknown as QueuedEntry;
}

test("device copy: a snapshot from before the canteen reads as no canteen", () => {
  const raw = snapshot() as Record<string, unknown>;
  delete raw.canteen;
  const data = reviveSnapshot({ ...raw, school: { ...(raw.school as object), canteenEnabled: undefined } });
  const ds = canteenDataset(data);
  assert.equal(ds.enabled, false);
  assert.equal(ds.plan, null);
  assert.equal(canteenOverview(ds, {}, NOW).rows.length, 0);
});

test("device copy: who is late, and the rappel they would receive", () => {
  const ds = canteenDataset(reviveSnapshot(snapshot()));
  const overview = canteenOverview(ds, { vue: "retards" }, NOW);
  // Ali owes October to December; Fatou paid the first trimester.
  assert.deepEqual(overview.rows.map((r) => r.student.id), ["s-1"]);
  assert.equal(overview.stats.lateAmount, 15000);
  assert.equal(overview.stats.enrolledCount, 2);

  const reminder = canteenReminderFor(ds, "s-1", NOW);
  assert.ok(!("error" in reminder));
  assert.match(reminder.message, /octobre à décembre 2026/);
  assert.match(reminder.message, /15\s000 CFA/u);
  assert.ok("error" in canteenReminderFor(ds, "s-2", NOW));
});

test("device copy: the payment window offers what is still owed", () => {
  const ds = canteenDataset(reviveSnapshot(snapshot()));
  const fatou = canteenPaymentContext(ds, "s-2", NOW);
  assert.ok(!("error" in fatou));
  assert.equal(fatou.annualAvailable, false);
  assert.deepEqual(fatou.pricing.packages.map((p) => p.id), ["t2"]);
  assert.ok("error" in canteenPaymentContext(ds, "s-3", NOW), "a student not enrolled cannot pay the canteen");
});

test("outbox: an enrolment, a payment and a departure typed offline show up at once", () => {
  const data = reviveSnapshot(snapshot());
  const local = applyPendingOperations(
    data,
    [
      entry({ kind: "canteen.enroll", studentId: "s-3", startMonth: "2026-12" }, "q-1", NOW.getTime()),
      entry(
        {
          kind: "canteen.payment",
          payload: {
            studentId: "s-3",
            selection: { annual: false, packageIds: [], months: ["2026-12"] },
            method: "cash",
            date: "2026-12-10",
            receivedBy: "",
            notifyWhatsapp: false,
          },
        },
        "q-2",
        NOW.getTime() + 1
      ),
      entry({ kind: "canteen.leave", studentId: "s-2", endMonth: "2027-01" }, "q-3", NOW.getTime() + 2),
      // Paying a month already paid is dropped, as the server would refuse it.
      entry(
        {
          kind: "canteen.payment",
          payload: {
            studentId: "s-2",
            selection: { annual: false, packageIds: [], months: ["2026-10"] },
            method: "cash",
            date: "2026-12-10",
            receivedBy: "",
            notifyWhatsapp: false,
          },
        },
        "q-4",
        NOW.getTime() + 3
      ),
    ],
    NOW
  );
  const ds = canteenDataset(local);
  const issa = canteenOverview(ds, {}, NOW).rows.find((r) => r.student.id === "s-3");
  assert.ok(issa, "Issa now eats at the canteen");
  assert.deepEqual(issa.summary.months.map((m) => [m.month, m.status]).slice(0, 2), [
    ["2026-12", "paid"],
    ["2027-01", "upcoming"],
  ]);
  const unsynced = ds.payments.filter((p) => !p.synced);
  assert.equal(unsynced.length, 1);
  assert.equal(unsynced[0].receiptNumber, 0, "numbered by the server only");

  const fatou = canteenOverview(ds, {}, NOW).rows.find((r) => r.student.id === "s-2");
  assert.equal(fatou?.enrolled, false);
  assert.equal(fatou?.summary.months.at(-1)?.month, "2027-01");
});

test("outbox: a departure that would leave a paid month behind is not applied", () => {
  const local = applyPendingOperations(
    reviveSnapshot(snapshot()),
    [entry({ kind: "canteen.leave", studentId: "s-2", endMonth: "2026-10" }, "q-1")],
    NOW
  );
  assert.equal(local.canteen.enrollments.find((e) => e.studentId === "s-2")?.endMonth, null);
});

// ---------------------------------------------------------------------------
// Mois sans cantine
// ---------------------------------------------------------------------------

test("sans cantine: a skipped month is neither owed nor late, and the student stays enrolled", () => {
  const now = new Date(2027, 2, 10); // 10 mars 2027
  const summary = canteenSummary(plan, wholeYear, paid("2026-10", "2026-11", "2026-12", "2027-01"), now, ["2027-02"]);
  const byMonth = Object.fromEntries(summary.months.map((m) => [m.month, m.status]));
  assert.equal(byMonth["2027-02"], "skipped");
  assert.deepEqual(summary.lateMonths, ["2027-03"]);
  assert.equal(summary.billableCount, 8);
  assert.equal(summary.remainingAmount, 4 * 5000, "mars à juin, février exclu");
});

test("sans cantine: the month cannot be paid, and packages or the annual price covering it no longer apply", () => {
  const skipped = ["2026-11"];
  assert.equal(
    quoteCanteenPayment(plan, wholeYear, [], { annual: false, packageIds: [], months: ["2026-11"] }, skipped).ok,
    false
  );
  const pricing = canteenPricing(plan, wholeYear, [], skipped);
  assert.equal(annualAvailable(pricing), false);
  assert.deepEqual(availablePackages(pricing).map((p) => p.id), ["t2"]);
  const ok = quoteCanteenPayment(plan, wholeYear, [], { annual: false, packageIds: [], months: ["2026-10", "2026-12"] }, skipped);
  assert.ok(ok.ok);
  assert.equal(ok.amount, 10000);
});

test("outbox: marking a month sans cantine offline takes it out of the late list at once, and back", () => {
  const data = reviveSnapshot(snapshot());
  const skipNov = entry({ kind: "canteen.skip", studentId: "s-1", month: "2026-11", skipped: true }, "k-1");
  const local = applyPendingOperations(data, [skipNov], NOW);
  const ali = canteenOverview(canteenDataset(local), {}, NOW).rows.find((r) => r.student.id === "s-1")!;
  assert.deepEqual(ali.summary.lateMonths, ["2026-10", "2026-12"]);

  const undo = entry({ kind: "canteen.skip", studentId: "s-1", month: "2026-11", skipped: false }, "k-2", NOW.getTime() + 1);
  const back = applyPendingOperations(data, [skipNov, undo], NOW);
  assert.equal(back.canteen.skips.length, 0);

  // A paid month is not marked: Fatou paid November with the first trimester.
  const onPaid = applyPendingOperations(
    data,
    [entry({ kind: "canteen.skip", studentId: "s-2", month: "2026-11", skipped: true }, "k-3")],
    NOW
  );
  assert.equal(onPaid.canteen.skips.length, 0);
});

test("paiement annulé : il ne règle plus aucun mois", () => {
  const now = new Date(2026, 11, 3, 10);
  const cancelled = [{ months: [{ month: "2026-10", amount: 5000 }], cancelledAt: new Date(2026, 9, 2) }];
  const summary = canteenSummary(plan, wholeYear, cancelled, now);
  assert.equal(summary.paidCount, 0);
  assert.deepEqual(summary.lateMonths, ["2026-10", "2026-11"]);
  assert.ok(quoteCanteenPayment(plan, wholeYear, cancelled, { annual: false, packageIds: [], months: ["2026-10"] }).ok);
});
