/** Subscription plans. Shared by the abonnement page, the form and the server action. */

export type PlanId = "monthly" | "yearly";

export type Plan = {
  id: PlanId;
  label: string;
  amount: number;
  /** Days of access added when the payment succeeds. */
  durationDays: number;
  period: string;
};

export const PLANS: Record<PlanId, Plan> = {
  monthly: { id: "monthly", label: "Mensuel", amount: 5000, durationDays: 30, period: "par mois" },
  yearly: { id: "yearly", label: "Annuel", amount: 55000, durationDays: 365, period: "par an" },
};

export const PLAN_LIST: Plan[] = [PLANS.monthly, PLANS.yearly];

export function getPlan(id: string | null | undefined): Plan {
  return id === "yearly" ? PLANS.yearly : PLANS.monthly;
}

/** Months paid for free by taking the yearly plan instead of 12 monthly ones. */
export function yearlySavings() {
  const twelveMonths = PLANS.monthly.amount * 12;
  const saved = twelveMonths - PLANS.yearly.amount;
  return { twelveMonths, saved, freeMonths: Math.round(saved / PLANS.monthly.amount) };
}
