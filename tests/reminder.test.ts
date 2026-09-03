import test from "node:test";
import assert from "node:assert/strict";
import { fillReminderTemplate, DEFAULT_REMINDER_TEMPLATE } from "../src/lib/whatsapp";

const fill = (over: Partial<Parameters<typeof fillReminderTemplate>[1]> = {}) =>
  fillReminderTemplate(DEFAULT_REMINDER_TEMPLATE, {
    parent: "Mme BAMBARA M.",
    tranche: "2e tranche",
    eleve: "Noélie BAMBARA",
    classe: "CP1",
    montant: "16 799",
    echeance: "19/08/2026",
    ecole: "Lycée municipal de Ouagadougou",
    ...over,
  });

test("le message de rappel remplace toutes les variables", () => {
  const msg = fill();
  assert.match(msg, /Bonjour Mme BAMBARA M\./);
  assert.match(msg, /la 2e tranche de la scolarité de Noélie BAMBARA \(CP1\)/);
  assert.match(msg, /16 799 CFA/);
  assert.match(msg, /attendue le 19\/08\/2026/);
  assert.match(msg, /— Lycée municipal de Ouagadougou/);
  assert.doesNotMatch(msg, /\{[a-z]+\}/, "aucune variable ne doit rester");
});

// Régression : le repli valait "scolarité", ce qui produisait
// « la scolarité de la scolarité de … » puisque le modèle dit déjà
// « la {tranche} de la scolarité ».
test("le repli sans tranche due ne duplique pas « scolarité »", () => {
  const msg = fill({ tranche: "part restante", echeance: "dès que possible" });
  assert.doesNotMatch(msg, /la scolarité de la scolarité/);
  assert.match(msg, /la part restante de la scolarité/);
  assert.match(msg, /attendue le dès que possible/);
});

test("le nom de l'école apparaît, jamais un texte générique", () => {
  const msg = fill({ ecole: "Cité de l'avenir" });
  assert.match(msg, /— Cité de l'avenir$/);
  assert.doesNotMatch(msg, /l'établissement/);
});

test("un modèle personnalisé est respecté", () => {
  const msg = fillReminderTemplate("{eleve} doit {montant} CFA à {ecole}.", {
    parent: "P", tranche: "T", eleve: "Ali OUEDRAOGO", classe: "6e",
    montant: "40 000", echeance: "01/01/2027", ecole: "École X",
  });
  assert.equal(msg, "Ali OUEDRAOGO doit 40 000 CFA à École X.");
});
