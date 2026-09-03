import test from "node:test";
import assert from "node:assert/strict";
import { nextMatricule, matriculeNumber, normalizeMatricule } from "../src/lib/matricule";

test("nextMatricule starts at BG-451 when empty", () => {
  assert.equal(nextMatricule([]), "BG-451");
});

test("nextMatricule increments past the highest number", () => {
  assert.equal(nextMatricule(["BG-451", "BG-460", "BG-455"]), "BG-461");
});

test("nextMatricule ignores non-numeric matricules", () => {
  assert.equal(nextMatricule(["ABC", "BG-500"]), "BG-501");
});

test("matriculeNumber extracts digits", () => {
  assert.equal(matriculeNumber("BG-451"), 451);
  assert.equal(matriculeNumber("2024-A-12"), 202412);
  assert.equal(matriculeNumber("no-digits"), null);
});

test("normalizeMatricule trims and uppercases", () => {
  assert.equal(normalizeMatricule("  bg-451 "), "BG-451");
  assert.equal(normalizeMatricule("a  b"), "A B");
});
