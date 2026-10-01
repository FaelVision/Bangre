import type {
  CanteenEnrollment,
  CanteenPackage,
  CanteenPayment,
  CanteenPaymentMonth,
  CanteenPlan,
} from "@prisma/client";
import { formatCFA, formatDate } from "@/lib/format";
import { serviceInfo, type SchoolService } from "@/lib/services";

/**
 * The canteen rules: which months a student owes, which are paid or late, and
 * what a selection of months costs. Pure — the server (`canteen-core.ts`) and
 * the device (offline, from its local copy) apply exactly the same rules, so a
 * payment taken without a network is priced the way the server will price it.
 *
 * A month is written "YYYY-MM" ("2026-10"): such keys sort in calendar order
 * as plain strings.
 */

export type CanteenPlanWithPackages = CanteenPlan & { packages: CanteenPackage[] };
export type CanteenPaymentWithMonths = CanteenPayment & { months: CanteenPaymentMonth[] };

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && MONTH_RE.test(value);
}

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parts(key: string) {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

export function addMonths(key: string, count: number) {
  const { year, month } = parts(key);
  const index = year * 12 + (month - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Every month from `from` to `to`, both included. Empty when `to` is before `from`. */
export function monthRange(from: string, to: string) {
  const out: string[] = [];
  for (let key = from; key <= to; key = addMonths(key, 1)) {
    out.push(key);
    if (out.length > 120) break; // a typo in a year must not loop for ever
  }
  return out;
}

const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** "octobre 2026" */
export function monthLabel(key: string) {
  const { year, month } = parts(key);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** "Oct." — for the month chips. */
export function monthShortLabel(key: string) {
  const name = MONTH_NAMES[parts(key).month - 1];
  const short = name.length <= 4 ? name : `${name.slice(0, name.startsWith("juil") ? 4 : 3)}.`;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/**
 * Months in words, consecutive runs folded: "octobre à décembre 2026, février
 * 2027". What a receipt and a WhatsApp message say was paid or is owed.
 */
export function describeMonths(keys: string[]) {
  const sorted = [...new Set(keys)].sort();
  const runs: string[][] = [];
  for (const key of sorted) {
    const run = runs[runs.length - 1];
    if (run && addMonths(run[run.length - 1], 1) === key) run.push(key);
    else runs.push([key]);
  }
  return runs
    .map((run) => {
      if (run.length === 1) return monthLabel(run[0]);
      const first = parts(run[0]);
      const last = run[run.length - 1];
      const firstText = first.year === parts(last).year ? MONTH_NAMES[first.month - 1] : monthLabel(run[0]);
      return `${firstText} à ${monthLabel(last)}`;
    })
    .join(", ");
}

/**
 * The months a school can open its canteen on, for an academic year labelled
 * "2026-2027": August of the first year to July of the second.
 */
export function schoolYearMonths(yearLabel: string | null | undefined, now: Date = new Date()) {
  const startYear = Number(yearLabel?.match(/^(\d{4})/)?.[1]) || (now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1);
  return monthRange(`${startYear}-08`, `${startYear + 1}-07`);
}

/** October to June of that academic year — what most schools run. */
export function defaultCanteenPeriod(yearLabel: string | null | undefined, now: Date = new Date()) {
  const months = schoolYearMonths(yearLabel, now);
  return { firstMonth: months[2], lastMonth: months[10] };
}

export function planMonths(plan: Pick<CanteenPlan, "firstMonth" | "lastMonth">) {
  return monthRange(plan.firstMonth, plan.lastMonth);
}

export function packageMonths(pkg: Pick<CanteenPackage, "months">) {
  return pkg.months
    .split(",")
    .map((m) => m.trim())
    .filter(isMonthKey)
    .sort();
}

/** The day a month's canteen must be paid by; past it, the month is late. */
export function monthDueDate(key: string, dueDay: number) {
  const { year, month } = parts(key);
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(Math.max(1, dueDay), lastDay), 23, 59, 59);
}

// ---------------------------------------------------------------------------
// Enrolment and payment state
// ---------------------------------------------------------------------------

type EnrollmentSpan = Pick<CanteenEnrollment, "startMonth" | "endMonth">;

/** A payment as the rules read it. A cancelled one settles nothing. */
type PaymentLike = { months: Pick<CanteenPaymentMonth, "month" | "amount">[]; cancelledAt?: Date | null };

/** The stretch still running, if the student currently eats at the canteen. */
export function openEnrollment<T extends EnrollmentSpan>(enrollments: T[]): T | null {
  return enrollments.find((e) => e.endMonth == null) ?? null;
}

/** The months of the plan the student is enrolled for, every stretch together. */
export function enrolledMonths(plan: Pick<CanteenPlan, "firstMonth" | "lastMonth">, enrollments: EnrollmentSpan[]) {
  const set = new Set<string>();
  for (const e of enrollments) {
    const from = e.startMonth > plan.firstMonth ? e.startMonth : plan.firstMonth;
    const to = e.endMonth && e.endMonth < plan.lastMonth ? e.endMonth : plan.lastMonth;
    for (const m of monthRange(from, to)) set.add(m);
  }
  return [...set].sort();
}

/** What has been paid on each month, every payment together. */
export function paidByMonth(payments: PaymentLike[]) {
  const paid = new Map<string, number>();
  for (const p of payments) {
    if (p.cancelledAt) continue;
    for (const m of p.months) paid.set(m.month, (paid.get(m.month) ?? 0) + m.amount);
  }
  return paid;
}

/** "skipped": a month the student does not eat at the canteen — not owed, never late. */
export type CanteenMonthStatus = "paid" | "late" | "due" | "upcoming" | "skipped";

export type CanteenMonthState = {
  month: string;
  status: CanteenMonthStatus;
  dueDate: Date;
  paid: number;
};

/**
 * One state per month the student is enrolled for. A month is settled once any
 * payment covered it (the receipt fixed its price then); a month marked "sans
 * cantine" is owed nothing; otherwise it is late past its due day, "due" from
 * its first day until then, "upcoming" before.
 */
export function canteenMonthStates(
  plan: Pick<CanteenPlan, "firstMonth" | "lastMonth" | "dueDay">,
  enrollments: EnrollmentSpan[],
  payments: PaymentLike[],
  now: Date = new Date(),
  skipped: string[] = []
): CanteenMonthState[] {
  const paid = paidByMonth(payments);
  const skip = new Set(skipped);
  const current = monthKey(now);
  return enrolledMonths(plan, enrollments).map((month) => {
    const dueDate = monthDueDate(month, plan.dueDay);
    let status: CanteenMonthStatus;
    if (paid.has(month)) status = "paid";
    else if (skip.has(month)) status = "skipped";
    else if (dueDate.getTime() < now.getTime()) status = "late";
    else if (month <= current) status = "due";
    else status = "upcoming";
    return { month, status, dueDate, paid: paid.get(month) ?? 0 };
  });
}

export type CanteenSummary = {
  months: CanteenMonthState[];
  paidCount: number;
  /** Months the student eats at the canteen: enrolled for, not marked "sans cantine". */
  billableCount: number;
  lateMonths: string[];
  /** Late months at the monthly price. */
  lateAmount: number;
  /** Every month not paid yet, late or to come, at the monthly price. */
  remainingAmount: number;
  status: "a_jour" | "retard";
  statusLabel: string;
};

export function canteenSummary(
  plan: Pick<CanteenPlan, "firstMonth" | "lastMonth" | "dueDay" | "monthlyPrice">,
  enrollments: EnrollmentSpan[],
  payments: PaymentLike[],
  now: Date = new Date(),
  skipped: string[] = []
): CanteenSummary {
  const months = canteenMonthStates(plan, enrollments, payments, now, skipped);
  const lateMonths = months.filter((m) => m.status === "late").map((m) => m.month);
  const paidCount = months.filter((m) => m.status === "paid").length;
  const unpaid = months.filter((m) => m.status !== "paid" && m.status !== "skipped").length;
  const lateAmount = lateMonths.length * plan.monthlyPrice;
  return {
    months,
    paidCount,
    billableCount: paidCount + unpaid,
    lateMonths,
    lateAmount,
    remainingAmount: unpaid * plan.monthlyPrice,
    status: lateMonths.length > 0 ? "retard" : "a_jour",
    statusLabel:
      lateMonths.length > 0
        ? `En retard · ${lateMonths.length} mois · ${formatCFA(lateAmount)}`
        : unpaid === 0
          ? "Année réglée"
          : "À jour",
  };
}

// ---------------------------------------------------------------------------
// Pricing a payment
// ---------------------------------------------------------------------------

/**
 * What the counter selected: the whole year at its annual price, some of the
 * school's packages, and single months at the monthly price. Packages and
 * months may be combined ("1er trimestre + janvier"), never overlap.
 */
export type CanteenSelection = { annual: boolean; packageIds: string[]; months: string[] };

export type CanteenQuote =
  | { ok: true; amount: number; label: string; allocations: { month: string; amount: number }[] }
  | { ok: false; error: string };

/** A price spread over months, to the franc: the first months carry the remainder. */
function spread(price: number, months: string[]) {
  const base = Math.floor(price / months.length);
  let rest = price - base * months.length;
  return months.map((month) => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return { month, amount: base + extra };
  });
}

/** Months the student must still pay: enrolled for, not "sans cantine", not settled yet. */
export function unpaidMonths(
  plan: Pick<CanteenPlan, "firstMonth" | "lastMonth">,
  enrollments: EnrollmentSpan[],
  payments: PaymentLike[],
  skipped: string[] = []
) {
  const paid = paidByMonth(payments);
  const skip = new Set(skipped);
  return enrolledMonths(plan, enrollments).filter((m) => !paid.has(m) && !skip.has(m));
}

/** What a student's selection is priced against: the plan's prices and the months they still owe. */
export type CanteenPricing = {
  monthlyPrice: number;
  annualPrice: number | null;
  /** Every month the canteen runs this year. */
  allMonths: string[];
  /** The months this student still has to pay. */
  owed: string[];
  packages: { id: string; label: string; price: number; months: string[] }[];
};

export function canteenPricing(
  plan: CanteenPlanWithPackages,
  enrollments: EnrollmentSpan[],
  payments: PaymentLike[],
  skipped: string[] = []
): CanteenPricing {
  return {
    monthlyPrice: plan.monthlyPrice,
    annualPrice: plan.annualPrice,
    allMonths: planMonths(plan),
    // A month "sans cantine" is not owed: the annual price and any package
    // covering it no longer apply.
    owed: unpaidMonths(plan, enrollments, payments, skipped),
    packages: [...plan.packages]
      .sort((a, b) => a.order - b.order)
      .map((p) => ({ id: p.id, label: p.label, price: p.price, months: packageMonths(p) })),
  };
}

/** The annual price applies to a student who owes every month of the year and has paid none. */
export function annualAvailable(pricing: Pick<CanteenPricing, "annualPrice" | "allMonths" | "owed">) {
  if (!pricing.annualPrice) return false;
  const owed = [...pricing.owed].sort();
  return owed.length === pricing.allMonths.length && pricing.allMonths.every((m, i) => owed[i] === m);
}

/** A package is offered while every one of its months is still owed. */
export function availablePackages(pricing: Pick<CanteenPricing, "packages" | "owed">) {
  const owed = new Set(pricing.owed);
  return pricing.packages.filter((p) => p.months.length > 0 && p.months.every((m) => owed.has(m)));
}

export function quoteCanteenPayment(
  plan: CanteenPlanWithPackages,
  enrollments: EnrollmentSpan[],
  payments: PaymentLike[],
  selection: CanteenSelection,
  skipped: string[] = []
): CanteenQuote {
  return priceCanteenSelection(canteenPricing(plan, enrollments, payments, skipped), selection);
}

/**
 * The amount, receipt wording and per-month split of a selection. The payment
 * window shows exactly this before the counter validates, and the server
 * recomputes it from its own data when the payment arrives.
 */
export function priceCanteenSelection(pricing: CanteenPricing, selection: CanteenSelection): CanteenQuote {
  const owed = new Set(pricing.owed);

  if (selection.annual) {
    if (!annualAvailable(pricing)) {
      return {
        ok: false,
        error: "Le tarif annuel ne s'applique qu'à un élève inscrit toute l'année et sans mois déjà payé.",
      };
    }
    return {
      ok: true,
      amount: pricing.annualPrice!,
      label: `Année complète (${describeMonths(pricing.allMonths)})`,
      allocations: spread(pricing.annualPrice!, pricing.allMonths),
    };
  }

  const allocations: { month: string; amount: number }[] = [];
  const taken = new Set<string>();
  const labels: string[] = [];

  for (const id of new Set(selection.packageIds)) {
    const pkg = pricing.packages.find((p) => p.id === id);
    if (!pkg) return { ok: false, error: "Ce forfait n'existe plus : rouvrez la fenêtre de paiement." };
    if (pkg.months.length === 0) return { ok: false, error: `Le forfait « ${pkg.label} » n'a aucun mois.` };
    for (const m of pkg.months) {
      if (!owed.has(m)) {
        return {
          ok: false,
          error: `${capitalize(monthLabel(m))} n'est plus dû : le forfait « ${pkg.label} » ne s'applique plus.`,
        };
      }
      if (taken.has(m)) {
        return { ok: false, error: `${capitalize(monthLabel(m))} est compris deux fois dans la sélection.` };
      }
      taken.add(m);
    }
    allocations.push(...spread(pkg.price, pkg.months));
    labels.push(pkg.label);
  }

  const singles: string[] = [];
  for (const m of [...new Set(selection.months)].sort()) {
    if (!isMonthKey(m) || !owed.has(m)) {
      return {
        ok: false,
        error: `${isMonthKey(m) ? capitalize(monthLabel(m)) : "Ce mois"} n'est pas dû par cet élève (déjà payé ou hors inscription).`,
      };
    }
    if (taken.has(m)) continue; // already in a selected package
    taken.add(m);
    singles.push(m);
    allocations.push({ month: m, amount: pricing.monthlyPrice });
  }
  if (singles.length) labels.push(describeMonths(singles));

  if (allocations.length === 0) return { ok: false, error: "Choisissez au moins un mois." };

  allocations.sort((a, b) => (a.month < b.month ? -1 : 1));
  const amount = allocations.reduce((s, a) => s + a.amount, 0);
  if (amount <= 0) return { ok: false, error: "Montant invalide." };
  return { ok: true, amount, label: capitalize(labels.join(" + ")), allocations };
}

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** The WhatsApp confirmation after a canteen (or garde) payment. */
export function canteenConfirmationMessage(input: {
  service?: SchoolService;
  amount: number;
  label: string;
  studentFirstName: string;
  studentLastName: string;
  className: string;
  date: Date;
  schoolName: string;
  receiptNumber: number | null;
}) {
  const receipt = input.receiptNumber ? `reçu N° ${input.receiptNumber}` : "reçu remis à l'école";
  return `Bonjour, nous confirmons la réception de ${formatCFA(input.amount)} pour ${serviceInfo(input.service).the} de ${input.studentFirstName} ${input.studentLastName} (${input.className}) le ${formatDate(input.date)} : ${input.label.charAt(0).toLowerCase()}${input.label.slice(1)}. Merci. — ${input.schoolName}, ${receipt}`;
}

/** The rappel to a family whose canteen (or garde) months are late. */
export function canteenReminderMessage(input: {
  service?: SchoolService;
  parentName: string | null;
  studentFirstName: string;
  studentLastName: string;
  className: string;
  lateMonths: string[];
  amount: number;
  schoolName: string;
}) {
  return `Bonjour ${input.parentName || "Parent"}, ${serviceInfo(input.service).the} de ${input.studentFirstName} ${input.studentLastName} (${input.className}) n'est pas réglée pour ${describeMonths(input.lateMonths)}. Montant dû : ${formatCFA(input.amount)}. Merci de passer à l'école pour régulariser. — ${input.schoolName}`;
}
