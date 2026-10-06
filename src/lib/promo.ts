/**
 * Free promotional period: Bangré is open to every school until this date,
 * whatever their subscription status. Past it, the paid subscription applies
 * again on its own — a school that paid keeps its own renewal date.
 *
 * Override with PROMO_FREE_UNTIL (ISO date) to extend or end the promotion
 * without a code change.
 */
const DEFAULT_FREE_UNTIL = "2027-08-31T23:59:59.999Z";

export function promoEndsAt(): Date {
  const custom = process.env.PROMO_FREE_UNTIL ? new Date(process.env.PROMO_FREE_UNTIL) : null;
  return custom && !Number.isNaN(custom.getTime()) ? custom : new Date(DEFAULT_FREE_UNTIL);
}

export function isPromoPeriod(now: Date = new Date()): boolean {
  return now.getTime() <= promoEndsAt().getTime();
}
