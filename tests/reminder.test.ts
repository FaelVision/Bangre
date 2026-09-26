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

// --- Le message suit la situation de l'élève ---------------------------------

import {
  previewForStudent,
  parseReminderTemplates,
  serializeReminderTemplates,
  DEFAULT_REMINDER_TEMPLATES,
} from "../src/lib/reminder-message";
import type { StudentWithPayments } from "../src/lib/tuition";

const NOW = new Date("2027-01-20T10:00:00.000Z");

/** Intl writes "20 000" with a narrow no-break space; compare on plain spaces. */
function preview(...args: Parameters<typeof previewForStudent>) {
  const res = previewForStudent(...args);
  return res.ok ? { ...res, message: res.message.replace(/[  ]/g, " ") } : res;
}

function tranche(id: string, label: string, amount: number, dueDate: string, order: number, kind = "tuition") {
  return { id, classId: "c1", label, amount, kind, dueType: "date", dueDate: new Date(dueDate), order };
}

function studentWith(paidByTranche: Record<string, number>, template: string | null = null): StudentWithPayments {
  const tranches = [
    tranche("t0", "Frais d'inscription", 10000, "2026-10-01T00:00:00.000Z", 0, "registration"),
    tranche("t1", "1re tranche", 25000, "2026-10-15T00:00:00.000Z", 1),
    tranche("t2", "2e tranche", 25000, "2027-01-15T00:00:00.000Z", 2),
    tranche("t3", "3e tranche", 20000, "2027-04-15T00:00:00.000Z", 3),
  ];
  return {
    id: "s1",
    schoolId: "sc",
    classId: "c1",
    matricule: "BG-1",
    lastName: "OUEDRAOGO",
    firstName: "Awa",
    birthDate: null,
    gender: "F",
    parentName: "M. OUEDRAOGO",
    parentPhone: "+22670000000",
    whatsappStatus: "reachable",
    status: "active",
    tuitionOverride: null,
    createdAt: new Date("2026-09-01"),
    class: {
      id: "c1",
      schoolId: "sc",
      academicYearId: "y",
      name: "CM1",
      level: "Primaire",
      order: 1,
      tuitionAmount: 70000,
      registrationFee: 10000,
      reminderEnabled: true,
      reminderBeforeDays: 7,
      reminderAfterDays: "3,10",
      reminderHour: "08:00",
      reminderMessageTemplate: template,
      archived: false,
      createdAt: new Date("2026-09-01"),
      tranches,
    },
    payments: [
      {
        id: "p1",
        schoolId: "sc",
        studentId: "s1",
        amount: Object.values(paidByTranche).reduce((a, b) => a + b, 0),
        method: "cash",
        receivedBy: null,
        date: new Date("2026-09-10"),
        receiptNumber: 1,
        note: null,
        offlineCreated: false,
        synced: true,
        whatsappNotified: false,
        allocations: Object.entries(paidByTranche).map(([trancheId, amount], i) => ({
          id: `a${i}`,
          paymentId: "p1",
          trancheId,
          amount,
        })),
      },
    ],
  } as StudentWithPayments;
}

test("échéance à venir : « est attendue le »", () => {
  const res = preview(studentWith({ t0: 10000, t1: 25000, t2: 25000 }), "École X", null, NOW);
  assert.ok(res.ok);
  assert.equal(res.situation, "a_venir");
  assert.match(res.message, /la 3e tranche de la scolarité de Awa OUEDRAOGO \(CM1\)/);
  assert.match(res.message, /est attendue le 15\/04\/2027/);
});

test("une seule tranche en retard : le message parle du retard, pas d'une échéance à venir", () => {
  const res = preview(studentWith({ t0: 10000, t1: 25000 }), "École X", null, NOW);
  assert.ok(res.ok);
  assert.equal(res.situation, "retard");
  assert.equal(res.trancheId, "t2");
  assert.match(res.message, /la 2e tranche .* était attendue le 15\/01\/2027/);
  assert.match(res.message, /5 jours de retard/);
  assert.doesNotMatch(res.message, /est attendue/);
});

test("plusieurs tranches en retard : toutes listées, avec le total dû", () => {
  const res = preview(studentWith({ t0: 10000, t1: 5000 }), "École X", null, NOW);
  assert.ok(res.ok);
  assert.equal(res.situation, "retards_multiples");
  // The oldest overdue tranche is the one recorded against the reminder.
  assert.equal(res.trancheId, "t1");
  assert.match(res.message, /en retard sur 2 tranches/);
  assert.match(res.message, /• 1re tranche : 20 000 CFA, échéance du 15\/10\/2026 \(97 jours de retard\)/);
  assert.match(res.message, /• 2e tranche : 25 000 CFA, échéance du 15\/01\/2027 \(5 jours de retard\)/);
  assert.match(res.message, /Total à régulariser : 45 000 CFA/);
  // The upcoming 3rd tranche is not part of the arrears.
  assert.doesNotMatch(res.message, /3e tranche/);
  assert.doesNotMatch(res.message, /\{[a-z]+\}/);
});

test("les frais d'inscription en retard comptent parmi les retards cumulés", () => {
  const res = preview(studentWith({}), "École X", null, NOW);
  assert.ok(res.ok);
  assert.equal(res.situation, "retards_multiples");
  assert.match(res.message, /en retard sur 3 tranches/);
  assert.match(res.message, /• Frais d'inscription : 10 000 CFA/);
  assert.match(res.message, /Total à régulariser : 60 000 CFA/);
});

test("seuls les frais d'inscription en retard : message de retard, formulation neutre", () => {
  const res = preview(studentWith({ t1: 25000 }), "École X", null, new Date("2026-10-10T10:00:00Z"));
  assert.ok(res.ok);
  assert.equal(res.situation, "retard");
  assert.equal(res.trancheId, "t0");
  assert.match(res.message, /la part restante de la scolarité/);
  assert.match(res.message, /était attendue le 01\/10\/2026/);
});

test("un ancien modèle unique personnalisé ne sert qu'aux échéances à venir", () => {
  const custom = "Rappel : {eleve} doit {montant} CFA pour le {echeance}.";
  const templates = parseReminderTemplates(custom);
  assert.equal(templates.a_venir, custom);
  assert.equal(templates.retards_multiples, DEFAULT_REMINDER_TEMPLATES.retards_multiples);

  const late = preview(studentWith({ t0: 10000, t1: 5000 }, custom), "École X", null, NOW);
  assert.ok(late.ok);
  assert.match(late.message, /en retard sur 2 tranches/);
});

test("les trois messages personnalisés sont stockés puis relus à l'identique", () => {
  assert.equal(serializeReminderTemplates(DEFAULT_REMINDER_TEMPLATES), null, "les valeurs par défaut ne sont pas stockées");
  const stored = serializeReminderTemplates({ retards_multiples: "{eleve} : {nombre} retards.\n{detail}" });
  assert.ok(stored);
  const parsed = parseReminderTemplates(stored);
  assert.equal(parsed.retards_multiples, "{eleve} : {nombre} retards.\n{detail}");
  assert.equal(parsed.a_venir, DEFAULT_REMINDER_TEMPLATES.a_venir);

  const res = preview(studentWith({ t0: 10000, t1: 5000 }, stored), "École X", null, NOW);
  assert.ok(res.ok);
  assert.match(res.message, /^Awa OUEDRAOGO : 2 retards\.\n• 1re tranche/);
});
