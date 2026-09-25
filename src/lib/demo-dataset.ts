/**
 * The demonstration school, as data: the account identifiers and the school
 * itself — classes, students, tranches, payments, reminders — built in memory.
 *
 * Pure and database-free, so the mix of situations it produces can be asserted
 * in a unit test. `demo-school.ts` is what writes it down.
 */

export const DEMO_SCHOOL_NAME = "Groupe scolaire La Réussite";
export const DEMO_EMAIL = "demo@bangre.bf";
/** 00 is not an allocated Burkinabè mobile prefix: it cannot collide with a real school. */
export const DEMO_PHONE = "+22600112233";
export const DEMO_PASSWORD = "Bangre2026";
export const DEMO_CONTACT_NAME = "A. Ouédraogo";

/**
 * Same sentinel as `PERMANENT_RENEWAL_DATE` in `subscription-core.ts` (kept in
 * step by `tests/demo-school.test.ts`): the demo must never lock itself out in
 * front of a prospect. That module carries a `server-only` guard, which would
 * break the command-line entry point, hence the copy rather than an import.
 */
export const DEMO_RENEWAL_DATE = new Date("2099-12-31T00:00:00.000Z");

export const DEFAULT_REMINDER_TEMPLATE =
  "Bonjour {parent}, la {tranche} de la scolarité de {eleve} ({classe}), d'un montant de {montant} CFA, est attendue le {echeance}. Merci. — {ecole}";

// Deterministic: two resets give the same school, so a presentation rehearsed
// once looks exactly the same the second time.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SURNAMES = [
  "SAWADOGO", "KABORÉ", "TRAORÉ", "OUÉDRAOGO", "ZONGO", "COMPAORÉ", "DIALLO",
  "SANOU", "BAMBARA", "YAMEOGO", "KIENTEGA", "TAPSOBA", "NIKIEMA", "OUATTARA",
  "BATIONO", "KONE", "ILBOUDO", "KABRÉ", "SOME", "BELEM",
];
const FIRST_NAMES_F = [
  "Aminata", "Fatimata", "Mariam", "Aïcha", "Awa", "Noélie", "Fatou",
  "Aïssata", "Safiatou", "Salamata", "Hawa", "Djénéba", "Korotimi",
];
const FIRST_NAMES_M = [
  "Issouf", "Salif", "Boukary", "Rasmané", "Adama", "Karim", "Hamed",
  "Moussa", "Boubacar", "Idrissa", "Seydou", "Yacouba", "Ousmane",
];

type ClassPlan = {
  name: string;
  level: "Primaire" | "Collège" | "Lycée";
  order: number;
  studentCount: number;
  tuitionAmount: number | null;
  registrationFee: number | null;
};

/**
 * Eight classes, ~120 students: enough to make every screen look like a real
 * school, small enough that the lists stay readable on a shared screen and the
 * offline copy downloads in a second.
 *
 * The last class deliberately has no tuition set: it is what makes the
 * dashboard show its "ces élèves ne sont pas comptés" nudge, which is a good
 * thing to demonstrate rather than to hide.
 */
const CLASS_PLAN: ClassPlan[] = [
  { name: "CP1", level: "Primaire", order: 1, studentCount: 14, tuitionAmount: 90000, registrationFee: 8000 },
  { name: "CE1", level: "Primaire", order: 3, studentCount: 15, tuitionAmount: 95000, registrationFee: 8000 },
  { name: "CM2", level: "Primaire", order: 6, studentCount: 16, tuitionAmount: 110000, registrationFee: 9000 },
  { name: "6e A", level: "Collège", order: 7, studentCount: 18, tuitionAmount: 150000, registrationFee: 10000 },
  { name: "5e A", level: "Collège", order: 9, studentCount: 16, tuitionAmount: 150000, registrationFee: 10000 },
  { name: "4e A", level: "Collège", order: 10, studentCount: 15, tuitionAmount: 155000, registrationFee: 10000 },
  { name: "3e A", level: "Collège", order: 11, studentCount: 14, tuitionAmount: 160000, registrationFee: 10000 },
  { name: "2nde C", level: "Lycée", order: 12, studentCount: 12, tuitionAmount: null, registrationFee: null },
];

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** "2026-2027" — the school year the date falls in, September being the pivot. */
export function academicYearLabel(now: Date) {
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${year + 1}`;
}

export type DemoDataset = {
  academicYearLabel: string;
  classes: {
    id: string;
    name: string;
    level: string;
    order: number;
    tuitionAmount: number | null;
    registrationFee: number | null;
  }[];
  tranches: {
    id: string;
    classId: string;
    label: string;
    amount: number;
    kind: string;
    dueType: string;
    dueDate: Date;
    order: number;
  }[];
  students: {
    id: string;
    classId: string;
    matricule: string;
    lastName: string;
    firstName: string;
    birthDate: Date;
    gender: string;
    parentName: string;
    parentPhone: string | null;
    whatsappStatus: string;
  }[];
  payments: {
    id: string;
    studentId: string;
    amount: number;
    method: string;
    receivedBy: string;
    date: Date;
    receiptNumber: number;
  }[];
  allocations: { id: string; paymentId: string; trancheId: string; amount: number }[];
  reminders: { id: string; studentId: string; trancheId: string | null; message: string; sentAt: Date }[];
};

/**
 * Builds the whole dataset in memory — pure, so the mix of situations it
 * produces (soldés, partiels, retards, parents à appeler, encaissements du
 * jour) can be asserted in a test without a database.
 */
export function buildDemoDataset(now: Date = new Date(), newId: () => string = newDemoId): DemoDataset {
  const rng = mulberry32(20260925);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
  const int = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;

  const dataset: DemoDataset = {
    academicYearLabel: academicYearLabel(now),
    classes: [],
    tranches: [],
    students: [],
    payments: [],
    allocations: [],
    reminders: [],
  };

  const firstDue = addDays(now, -70);
  const secondDue = addDays(now, -12);
  const thirdDue = addDays(now, 50);
  const feeDue = addDays(now, -95);

  let matricule = 100;
  const receipts: { payment: DemoDataset["payments"][number]; allocations: DemoDataset["allocations"] }[] = [];

  for (const plan of CLASS_PLAN) {
    const classId = newId();
    dataset.classes.push({
      id: classId,
      name: plan.name,
      level: plan.level,
      order: plan.order,
      tuitionAmount: plan.tuitionAmount,
      registrationFee: plan.registrationFee,
    });

    let fee: DemoDataset["tranches"][number] | null = null;
    let instalments: DemoDataset["tranches"] = [];

    if (plan.tuitionAmount) {
      const first = Math.round(plan.tuitionAmount * 0.4);
      const second = Math.round(plan.tuitionAmount * 0.33);
      instalments = [
        { id: newId(), classId, label: "1re tranche", amount: first, kind: "tuition", dueType: "date", dueDate: firstDue, order: 1 },
        { id: newId(), classId, label: "2e tranche", amount: second, kind: "tuition", dueType: "end_of_term", dueDate: secondDue, order: 2 },
        {
          id: newId(),
          classId,
          label: "3e tranche",
          amount: plan.tuitionAmount - first - second,
          kind: "tuition",
          dueType: "end_of_term",
          dueDate: thirdDue,
          order: 3,
        },
      ];
      dataset.tranches.push(...instalments);
    }

    if (plan.registrationFee) {
      fee = {
        id: newId(),
        classId,
        label: "Frais d'inscription",
        amount: plan.registrationFee,
        kind: "registration",
        dueType: "date",
        dueDate: feeDue,
        order: 0,
      };
      dataset.tranches.push(fee);
    }

    for (let i = 0; i < plan.studentCount; i++) {
      const isFemale = rng() > 0.5;
      const lastName = pick(SURNAMES);
      const firstName = pick(isFemale ? FIRST_NAMES_F : FIRST_NAMES_M);
      matricule += 1;

      const age = plan.order <= 6 ? 6 + plan.order : 11 + (plan.order - 6);
      // One family in twelve has no usable WhatsApp number — that is what fills
      // the "parents à appeler" list the presentation is meant to show.
      const phoneRoll = rng();
      const hasPhone = phoneRoll > 0.08;
      const whatsappStatus = !hasPhone ? "invalid" : phoneRoll > 0.85 ? "unreachable" : "reachable";

      const studentId = newId();
      dataset.students.push({
        id: studentId,
        classId,
        matricule: `BG-${matricule}`,
        lastName,
        firstName,
        birthDate: new Date(Date.UTC(now.getFullYear() - age, int(0, 11), int(1, 28))),
        gender: isFemale ? "F" : "M",
        parentName: `${isFemale ? "Mme" : "M."} ${lastName} ${pick(FIRST_NAMES_M).charAt(0)}.`,
        parentPhone: hasPhone ? `+226 ${int(60, 79)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}` : null,
        whatsappStatus,
      });

      if (!instalments.length) continue;

      const pay = (tranche: DemoDataset["tranches"][number], date: Date, ratio = 1) => {
        const amount = Math.round(tranche.amount * ratio);
        if (amount <= 0) return;
        // Counter hours, so the journal does not show a dozen receipts landing
        // at the very second the demo was rebuilt.
        const at = new Date(date);
        at.setHours(int(8, 16), int(0, 59), int(0, 59), 0);
        const paymentId = newId();
        receipts.push({
          payment: {
            id: paymentId,
            studentId,
            amount,
            method: rng() > 0.75 ? "mobile_money" : "cash",
            receivedBy: DEMO_CONTACT_NAME,
            date: at,
            receiptNumber: 0, // assigned below, in date order
          },
          allocations: [{ id: newId(), paymentId, trancheId: tranche.id, amount }],
        });
      };

      const roll = rng();
      if (roll < 0.45) {
        // Soldé — including the instalment not yet due, paid over the last days
        // so "encaissé aujourd'hui / cette semaine" is never an empty figure.
        if (fee) pay(fee, addDays(feeDue, -int(0, 6)));
        pay(instalments[0], addDays(firstDue, -int(1, 9)));
        pay(instalments[1], addDays(secondDue, -int(1, 7)));
        pay(instalments[2], addDays(now, -int(0, 6)));
      } else if (roll < 0.67) {
        // À jour : rien d'échu ne reste dû, la 3e tranche vient plus tard. La
        // 2e est réglée récemment, pour que le journal des derniers jours mêle
        // plusieurs tranches plutôt que d'aligner la même ligne.
        if (fee) pay(fee, addDays(feeDue, -int(0, 6)));
        pay(instalments[0], addDays(firstDue, -int(1, 9)));
        pay(instalments[1], addDays(now, -int(0, 9)));
      } else if (roll < 0.9) {
        // En retard : la 2e tranche est échue, payée en partie pour la moitié.
        if (fee) pay(fee, addDays(feeDue, int(0, 10)));
        pay(instalments[0], addDays(firstDue, int(0, 12)));
        if (rng() > 0.5) pay(instalments[1], addDays(now, -int(1, 9)), 0.35 + rng() * 0.3);
      }
      // Le reste : rien payé du tout, entièrement en retard.

      const late = roll >= 0.67;
      if (late && whatsappStatus === "reachable" && rng() > 0.45) {
        dataset.reminders.push({
          id: newId(),
          studentId,
          trancheId: instalments[1].id,
          message: `Bonjour, la 2e tranche de la scolarité de ${firstName} ${lastName} (${plan.name}) est attendue. Merci. — ${DEMO_SCHOOL_NAME}`,
          sentAt: addDays(now, -int(1, 12)),
        });
      }
    }
  }

  // Receipts are numbered in the order the money came in, as the counter does.
  receipts.sort((a, b) => a.payment.date.getTime() - b.payment.date.getTime());
  receipts.forEach((receipt, index) => {
    receipt.payment.receiptNumber = index + 1;
    dataset.payments.push(receipt.payment);
    dataset.allocations.push(...receipt.allocations);
  });

  return dataset;
}

/** Identifiers are generated here rather than by the database, so a whole school can go in as a few batch inserts. */
export function newDemoId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
