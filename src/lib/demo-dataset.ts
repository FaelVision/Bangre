/**
 * The demonstration school, as data: the account identifiers and the school
 * itself — classes, students, tranches, payments, reminders — built in memory.
 *
 * Pure and database-free, so the mix of situations it produces can be asserted
 * in a unit test. `demo-school.ts` is what writes it down.
 */

import {
  capitalize,
  canteenReminderMessage,
  monthDueDate,
  monthKey,
  monthLabel,
  monthRange,
  priceCanteenSelection,
  schoolYearMonths,
} from "@/lib/canteen";
import { formatCFA } from "@/lib/format";

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
  canteen: DemoCanteen;
};

/** The canteen of the demo school — every situation the Cantine tab can show. */
export type DemoCanteen = {
  plan: {
    id: string;
    monthlyPrice: number;
    annualPrice: number;
    firstMonth: string;
    lastMonth: string;
    dueDay: number;
  };
  packages: { id: string; planId: string; label: string; months: string; price: number; order: number }[];
  enrollments: { id: string; studentId: string; startMonth: string; endMonth: string | null; createdAt: Date }[];
  payments: {
    id: string;
    studentId: string;
    amount: number;
    label: string;
    method: string;
    receivedBy: string;
    date: Date;
    receiptNumber: number;
  }[];
  paymentMonths: { id: string; paymentId: string; month: string; amount: number }[];
  skips: { id: string; studentId: string; month: string; createdAt: Date }[];
  reminders: { id: string; studentId: string; message: string; sentAt: Date }[];
  /** The canteen history, as the app would have written it. */
  actions: { id: string; studentId: string; kind: string; data: string; label: string; createdAt: Date }[];
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
    canteen: {
      plan: { id: "", monthlyPrice: 0, annualPrice: 0, firstMonth: "", lastMonth: "", dueDay: 5 },
      packages: [],
      enrollments: [],
      payments: [],
      paymentMonths: [],
      skips: [],
      reminders: [],
      actions: [],
    }, // filled below, once the students exist
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

  dataset.canteen = buildDemoCanteen(dataset, now, newId);

  // Receipts are numbered in the order the money came in, as the counter does —
  // tuition and canteen share one sequence, as they do in the app.
  receipts.sort((a, b) => a.payment.date.getTime() - b.payment.date.getTime());
  for (const receipt of receipts) {
    dataset.payments.push(receipt.payment);
    dataset.allocations.push(...receipt.allocations);
  }
  const numbered = [...dataset.payments, ...dataset.canteen.payments].sort((a, b) => a.date.getTime() - b.date.getTime());
  numbered.forEach((payment, index) => {
    payment.receiptNumber = index + 1;
  });
  dataset.canteen.actions = canteenHistory(dataset.canteen, now, newId);

  return dataset;
}

// ---------------------------------------------------------------------------
// Cantine
// ---------------------------------------------------------------------------

/** The classes whose families take the canteen in the demo — mostly the youngest. */
const CANTEEN_CLASSES: Record<string, number> = { CP1: 0.85, CE1: 0.8, CM2: 0.7, "6e A": 0.35 };

const CANTEEN_MONTHLY = 7500;
const CANTEEN_ANNUAL = 65000; // 10 months at 7 500 = 75 000: 10 000 saved paying the year at once
const CANTEEN_QUARTER = 21000; // 3 months at 7 500 = 22 500
const CANTEEN_DUE_DAY = 5;

/**
 * Who eats at the canteen and how each family pays: the whole year, by the
 * trimester, month by month, late, joined during the year, skipped months,
 * left. Dates follow `now`, like the rest of the demo, so the Cantine tab looks
 * lived-in whatever the day of the presentation.
 */
function buildDemoCanteen(
  dataset: DemoDataset,
  now: Date,
  newId: () => string
): DemoCanteen {
  // A seed of its own: the tuition side of the demo stays exactly as it was.
  const rng = mulberry32(20261001);
  const int = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;

  // September to June: the demo's school year is already well under way (its
  // first tranche fell due ten weeks ago), so its canteen has a history too —
  // with late months to show from the first days of October.
  const yearMonths = schoolYearMonths(dataset.academicYearLabel, now);
  const firstMonth = yearMonths[1];
  const lastMonth = yearMonths[10];
  const months = monthRange(firstMonth, lastMonth);
  const current = monthKey(now);
  const started = months.filter((m) => m <= current);
  const pastDue = months.filter((m) => monthDueDate(m, CANTEEN_DUE_DAY).getTime() < now.getTime());

  const planId = newId();
  const packages = [0, 3, 6].map((from, order) => ({
    id: newId(),
    planId,
    label: `${order + 1}${order === 0 ? "er" : "e"} trimestre`,
    months: months.slice(from, from + 3).join(","),
    price: CANTEEN_QUARTER,
    order,
  }));

  const canteen: DemoCanteen = {
    plan: { id: planId, monthlyPrice: CANTEEN_MONTHLY, annualPrice: CANTEEN_ANNUAL, firstMonth, lastMonth, dueDay: CANTEEN_DUE_DAY },
    packages,
    enrollments: [],
    payments: [],
    paymentMonths: [],
    skips: [],
    reminders: [],
    actions: [],
  };

  /** A counter moment early in `month` — never later than now. */
  const dayIn = (month: string, maxDay = 4) => {
    const [y, m] = month.split("-").map(Number);
    const at = new Date(y, m - 1, int(1, maxDay), int(8, 16), int(0, 59), int(0, 59));
    return at.getTime() < now.getTime() ? at : new Date(now.getTime() - int(1, 4) * 24 * 60 * 60 * 1000);
  };

  const classById = new Map(dataset.classes.map((c) => [c.id, c.name]));
  const state = new Map<string, { owed: string[]; skipped: Set<string> }>();

  const enroll = (studentId: string, startMonth: string, endMonth: string | null = null) => {
    const createdAt = dayIn(startMonth, 1);
    createdAt.setDate(Math.max(1, createdAt.getDate() - 3));
    canteen.enrollments.push({ id: newId(), studentId, startMonth, endMonth, createdAt });
    const owed = months.filter((m) => m >= startMonth && (!endMonth || m <= endMonth));
    state.set(studentId, { owed, skipped: new Set() });
  };

  /** Prices the selection with the app's own rules, so labels and amounts are the real ones. */
  const pay = (studentId: string, selection: { annual?: boolean; packageIds?: string[]; months?: string[] }, date: Date) => {
    const s = state.get(studentId)!;
    const quote = priceCanteenSelection(
      {
        monthlyPrice: CANTEEN_MONTHLY,
        annualPrice: CANTEEN_ANNUAL,
        allMonths: months,
        owed: s.owed.filter((m) => !s.skipped.has(m)),
        packages: packages.map((p) => ({ id: p.id, label: p.label, price: p.price, months: p.months.split(",") })),
      },
      { annual: Boolean(selection.annual), packageIds: selection.packageIds ?? [], months: selection.months ?? [] }
    );
    if (!quote.ok) return;
    const paymentId = newId();
    canteen.payments.push({
      id: paymentId,
      studentId,
      amount: quote.amount,
      label: quote.label,
      method: rng() > 0.7 ? "mobile_money" : "cash",
      receivedBy: DEMO_CONTACT_NAME,
      date,
      receiptNumber: 0, // numbered with the tuition receipts, in date order
    });
    for (const a of quote.allocations) canteen.paymentMonths.push({ id: newId(), paymentId, ...a });
    s.owed = s.owed.filter((m) => !quote.allocations.some((a) => a.month === m));
  };

  const payMonths = (studentId: string, list: string[]) => {
    for (const m of list) pay(studentId, { months: [m] }, dayIn(m));
  };

  for (const student of dataset.students) {
    const share = CANTEEN_CLASSES[classById.get(student.classId) ?? ""];
    if (!share || rng() > share) continue;

    const roll = rng();
    if (roll < 0.12) {
      // L'année entière, payée d'un coup à la rentrée.
      enroll(student.id, firstMonth);
      pay(student.id, { annual: true }, started.length ? dayIn(firstMonth) : dayIn(current));
    } else if (roll < 0.37) {
      // Au trimestre, chacun payé au début.
      enroll(student.id, firstMonth);
      for (const p of packages) {
        const first = p.months.split(",")[0];
        if (first <= current || p === packages[0]) pay(student.id, { packageIds: [p.id] }, dayIn(first));
      }
    } else if (roll < 0.6) {
      // Au mois, à jour ; le mois en cours parfois pas encore réglé (avant le 5).
      enroll(student.id, firstMonth);
      payMonths(student.id, started.filter((m) => m < current || rng() > 0.35));
    } else if (roll < 0.78) {
      // En retard : les un ou deux derniers mois échus ne sont pas payés.
      enroll(student.id, firstMonth);
      const unpaid = Math.min(pastDue.length, int(1, 2));
      payMonths(student.id, pastDue.slice(0, pastDue.length - unpaid));
      if (unpaid > 0 && student.whatsappStatus === "reachable" && rng() > 0.4) {
        const late = pastDue.slice(pastDue.length - unpaid);
        canteen.reminders.push({
          id: newId(),
          studentId: student.id,
          message: canteenReminderMessage({
            parentName: student.parentName,
            studentFirstName: student.firstName,
            studentLastName: student.lastName,
            className: classById.get(student.classId) ?? "",
            lateMonths: late,
            amount: late.length * CANTEEN_MONTHLY,
            schoolName: DEMO_SCHOOL_NAME,
          }),
          sentAt: new Date(now.getTime() - int(1, 6) * 24 * 60 * 60 * 1000),
        });
      }
    } else if (roll < 0.85) {
      // Arrivé en cours d'année : ne doit que depuis son arrivée.
      const start = started.length > 2 ? started[started.length - 2] : (months[2] ?? firstMonth);
      enroll(student.id, start);
      payMonths(student.id, started.filter((m) => m >= start && m < current));
    } else if (roll < 0.93) {
      // Un mois sans cantine (enfant absent), les autres payés.
      enroll(student.id, firstMonth);
      const skipped = started.length > 1 ? started[1] : months[1];
      state.get(student.id)!.skipped.add(skipped);
      canteen.skips.push({ id: newId(), studentId: student.id, month: skipped, createdAt: dayIn(skipped, 2) });
      payMonths(student.id, started.filter((m) => m !== skipped && m < current));
    } else {
      // Sorti de la cantine après quelques mois.
      const end = started.length > 1 ? started[1] : firstMonth;
      enroll(student.id, firstMonth, end);
      payMonths(student.id, months.filter((m) => m <= end && m <= current));
    }
  }

  // At least one canteen payment taken today: the journal of the day, and an
  // action the presenter can undo from the history.
  // Preferably a month already due — a family settling the current month at
  // the counter, rather than one paying far ahead.
  const nextOwed = (studentId: string) => {
    const s = state.get(studentId)!;
    return s.owed.find((m) => !s.skipped.has(m));
  };
  const open = canteen.enrollments.filter((e) => !e.endMonth && nextOwed(e.studentId));
  const today = open.find((e) => nextOwed(e.studentId)! <= current) ?? open[0];
  if (today) {
    const s = state.get(today.studentId)!;
    const next = s.owed.find((m) => !s.skipped.has(m))!;
    pay(today.studentId, { months: [next] }, new Date(now.getTime() - int(20, 90) * 60 * 1000));
  }

  return canteen;
}

/**
 * The canteen history the app would have recorded, written once every receipt
 * has its number. Only the last 30 days show on screen; today's can be undone.
 */
function canteenHistory(canteen: DemoCanteen, now: Date, newId: () => string): DemoCanteen["actions"] {
  const actions: DemoCanteen["actions"] = [];
  for (const e of canteen.enrollments) {
    actions.push({
      id: newId(),
      studentId: e.studentId,
      kind: "enroll",
      data: JSON.stringify({ enrollmentId: e.id }),
      label: `Inscription dès ${monthLabel(e.startMonth)}`,
      createdAt: e.createdAt,
    });
    if (e.endMonth) {
      // Recorded a little after the last month eaten — never in the future.
      const left = new Date(e.createdAt);
      left.setMonth(left.getMonth() + 2);
      if (left.getTime() > now.getTime()) left.setTime(now.getTime() - 24 * 60 * 60 * 1000);
      actions.push({
        id: newId(),
        studentId: e.studentId,
        kind: "leave",
        data: JSON.stringify({ enrollmentId: e.id, startMonth: e.startMonth, endMonth: e.endMonth, cancelled: false }),
        label: `Sortie de la cantine après ${monthLabel(e.endMonth)}`,
        createdAt: left,
      });
    }
  }
  for (const k of canteen.skips) {
    actions.push({
      id: newId(),
      studentId: k.studentId,
      kind: "skip",
      data: JSON.stringify({ month: k.month, skipped: true }),
      label: `${capitalize(monthLabel(k.month))} sans cantine`,
      createdAt: k.createdAt,
    });
  }
  for (const p of canteen.payments) {
    actions.push({
      id: newId(),
      studentId: p.studentId,
      kind: "payment",
      data: JSON.stringify({ paymentId: p.id }),
      label: `Paiement ${formatCFA(p.amount)} · ${p.label} · reçu N° ${String(p.receiptNumber).padStart(4, "0")}`,
      createdAt: p.date,
    });
  }
  return actions;
}

/** Identifiers are generated here rather than by the database, so a whole school can go in as a few batch inserts. */
export function newDemoId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
