import test from "node:test";
import assert from "node:assert/strict";
import { currentAcademicYearLabel, nextAcademicYearLabel, guessNextClassName } from "../src/lib/promotion";

const on = (iso: string) => currentAcademicYearLabel(new Date(iso));

test("l'année scolaire en cours suit le calendrier octobre → juin", () => {
  assert.equal(on("2026-10-15T00:00:00Z"), "2026-2027"); // rentrée
  assert.equal(on("2026-12-31T00:00:00Z"), "2026-2027");
  assert.equal(on("2027-03-10T00:00:00Z"), "2026-2027"); // en cours
  assert.equal(on("2027-06-20T00:00:00Z"), "2026-2027"); // fin d'année
});

// Régression : une école inscrite en août 2026 était rattachée à 2025-2026,
// l'année qui venait de se terminer, au lieu de celle qu'elle prépare.
test("une inscription pendant les vacances vise l'année à venir", () => {
  assert.equal(on("2026-07-01T00:00:00Z"), "2026-2027");
  assert.equal(on("2026-08-30T00:00:00Z"), "2026-2027");
  assert.equal(on("2026-09-20T00:00:00Z"), "2026-2027");
});

test("l'année suivante s'incrémente correctement", () => {
  assert.equal(nextAcademicYearLabel("2026-2027"), "2027-2028");
  assert.equal(nextAcademicYearLabel("2029-2030"), "2030-2031");
  assert.equal(nextAcademicYearLabel("libellé libre"), "libellé libre");
});

test("la classe suivante est devinée pour le primaire et le secondaire", () => {
  assert.equal(guessNextClassName("CP1"), "CP2");
  assert.equal(guessNextClassName("CM2"), "6e");
  assert.equal(guessNextClassName("6e A"), "5e A");
  assert.equal(guessNextClassName("3e B"), "2nde B");
  assert.equal(guessNextClassName("1ère D"), "Tle D");
  assert.equal(guessNextClassName("Tle C"), "Diplômé(e)");
  assert.equal(guessNextClassName("Section spéciale"), "Section spéciale (suivante)");
});
