import test from "node:test";
import assert from "node:assert/strict";
import { PLANS, PLAN_LIST, getPlan, yearlySavings } from "../src/lib/plans";

test("les deux formules ont le bon prix et la bonne durée", () => {
  assert.equal(PLANS.monthly.amount, 5000);
  assert.equal(PLANS.monthly.durationDays, 30);
  assert.equal(PLANS.yearly.amount, 55000);
  assert.equal(PLANS.yearly.durationDays, 365);
  assert.equal(PLAN_LIST.length, 2);
});

test("getPlan retombe sur le mensuel pour une valeur inconnue", () => {
  assert.equal(getPlan("yearly").id, "yearly");
  assert.equal(getPlan("monthly").id, "monthly");
  assert.equal(getPlan("bidon").id, "monthly");
  assert.equal(getPlan(null).id, "monthly");
  assert.equal(getPlan(undefined).id, "monthly");
});

test("l'économie annoncée pour l'annuel est exacte", () => {
  const s = yearlySavings();
  assert.equal(s.twelveMonths, 60000);
  assert.equal(s.saved, 5000);
  assert.equal(s.freeMonths, 1);
  assert.equal(PLANS.yearly.amount + s.saved, s.twelveMonths);
});
