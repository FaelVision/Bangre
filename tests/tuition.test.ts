import test from "node:test";
import assert from "node:assert/strict";
import {
  computeStudentSummary,
  computeTrancheStates,
  registrationFeeOf,
  type StudentWithPayments,
} from "../src/lib/tuition";

const YEAR = 2026;
const past = new Date(`${YEAR}-01-10`);
const future = new Date(`${YEAR + 1}-09-01`);

type TrancheSeed = { id: string; amount: number; order: number; kind?: string; dueDate?: Date };

function tranche({ id, amount, order, kind = "tuition", dueDate = past }: TrancheSeed) {
  return { id, classId: "c1", label: id, amount, kind, dueType: "date", dueDate, order };
}

function payment(id: string, allocations: { trancheId: string; amount: number }[]) {
  return {
    id,
    schoolId: "s1",
    studentId: "st1",
    amount: allocations.reduce((s, a) => s + a.amount, 0),
    method: "cash",
    receivedBy: null,
    date: past,
    receiptNumber: 1,
    note: null,
    offlineCreated: false,
    synced: true,
    whatsappNotified: false,
    allocations: allocations.map((a, i) => ({ id: `${id}-${i}`, paymentId: id, ...a })),
  };
}

function student(tranches: ReturnType<typeof tranche>[], payments: ReturnType<typeof payment>[] = []) {
  return {
    id: "st1",
    tuitionOverride: null,
    class: { id: "c1", tuitionAmount: 100_000, tranches },
    payments,
  } as unknown as StudentWithPayments;
}

const now = new Date(`${YEAR}-06-01`);

test("the enrolment fee is added on top of the tuition total", () => {
  const s = student([
    tranche({ id: "reg", amount: 10_000, order: 0, kind: "registration", dueDate: future }),
    tranche({ id: "t1", amount: 60_000, order: 1 }),
    tranche({ id: "t2", amount: 40_000, order: 2 }),
  ]);

  const summary = computeStudentSummary(s, now);
  assert.equal(summary.total, 110_000);
  assert.equal(summary.paid, 0);
  assert.equal(summary.remaining, 110_000);
  assert.equal(registrationFeeOf(s.class), 10_000);
});

test("a student is soldé only once the fee and every tranche are paid", () => {
  const tranches = [
    tranche({ id: "reg", amount: 10_000, order: 0, kind: "registration", dueDate: future }),
    tranche({ id: "t1", amount: 60_000, order: 1 }),
    tranche({ id: "t2", amount: 40_000, order: 2 }),
  ];

  const tuitionOnly = computeStudentSummary(
    student(tranches, [payment("p1", [{ trancheId: "t1", amount: 60_000 }, { trancheId: "t2", amount: 40_000 }])]),
    now
  );
  assert.equal(tuitionOnly.status, "partiel");
  assert.equal(tuitionOnly.remaining, 10_000);
  assert.equal(tuitionOnly.percent, 91);

  const full = computeStudentSummary(
    student(tranches, [
      payment("p1", [{ trancheId: "t1", amount: 60_000 }, { trancheId: "t2", amount: 40_000 }]),
      payment("p2", [{ trancheId: "reg", amount: 10_000 }]),
    ]),
    now
  );
  assert.equal(full.status, "solde");
  assert.equal(full.remaining, 0);
  assert.equal(full.percent, 100);
});

test("the registration tranche is ordered first", () => {
  const states = computeTrancheStates(
    [
      tranche({ id: "t1", amount: 60_000, order: 1 }),
      tranche({ id: "reg", amount: 10_000, order: 0, kind: "registration", dueDate: future }),
    ],
    [],
    now
  );
  assert.equal(states[0].tranche.id, "reg");
});

test("a class with no enrolment fee is unchanged", () => {
  const s = student([tranche({ id: "t1", amount: 100_000, order: 1 })]);
  const summary = computeStudentSummary(s, now);
  assert.equal(summary.total, 100_000);
  assert.equal(registrationFeeOf(s.class), 0);
});
