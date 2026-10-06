import { test } from "node:test";
import assert from "node:assert/strict";
import { isPromoPeriod, promoEndsAt } from "../src/lib/promo";

test("la promotion couvre l'année scolaire 2026-2027 puis s'arrête", () => {
  delete process.env.PROMO_FREE_UNTIL;
  assert.ok(isPromoPeriod(new Date("2026-10-06T10:00:00Z")));
  assert.ok(isPromoPeriod(new Date("2027-08-31T12:00:00Z")));
  assert.ok(!isPromoPeriod(new Date("2027-09-01T00:00:00Z")));
});

test("PROMO_FREE_UNTIL prolonge la promotion, une valeur invalide est ignorée", () => {
  process.env.PROMO_FREE_UNTIL = "2028-06-30T23:59:59Z";
  assert.ok(isPromoPeriod(new Date("2028-01-01T00:00:00Z")));
  process.env.PROMO_FREE_UNTIL = "n'importe quoi";
  assert.equal(promoEndsAt().toISOString(), "2027-08-31T23:59:59.999Z");
  delete process.env.PROMO_FREE_UNTIL;
});
