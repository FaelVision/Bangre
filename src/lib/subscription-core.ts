import "server-only";
import { prisma } from "@/lib/db";
import { getPlan, planForAmount } from "@/lib/plans";

const PROVIDERS = new Set(["orange_money", "moov_money"]);

// Sentinel renewal date used to mark a small number of hand-picked accounts
// (platform team, partners) as never expiring, without adding a separate
// schema flag — any date this far out is functionally "never" for the app.
export const PERMANENT_RENEWAL_DATE = new Date("2099-12-31T00:00:00.000Z");

export function isPermanentRenewal(date: Date | null) {
  return !!date && date.getFullYear() >= 2098;
}

export type RecordSubscriptionPaymentInput = {
  provider: string;
  phone: string;
  planId: string | null | undefined;
};

export type RecordSubscriptionPaymentResult = { ok: true; paymentId: string } | { ok: false; error: string };

/**
 * Logs that a school says it sent a Mobile Money payment. Nothing is charged
 * here — there is no merchant API integrated, the school transfers the money
 * themselves (see the "Composer" USSD links in subscription-form.tsx) — so the
 * subscription stays exactly as it was until an admin confirms the money
 * actually arrived, via confirmSubscriptionPayment.
 */
export async function recordSubscriptionPayment(
  schoolId: string,
  input: RecordSubscriptionPaymentInput
): Promise<RecordSubscriptionPaymentResult> {
  if (!input.provider || !PROVIDERS.has(input.provider) || !input.phone) {
    return { ok: false, error: "Sélectionnez un opérateur et un numéro." };
  }
  const plan = getPlan(input.planId);

  const payment = await prisma.subscriptionPayment.create({
    data: { schoolId, amount: plan.amount, provider: input.provider, phone: input.phone, status: "pending" },
  });

  return { ok: true, paymentId: payment.id };
}

export type SubscriptionPaymentDecisionResult = { ok: true; schoolId: string } | { ok: false; error: string };

/** Admin confirms a pending payment's money actually arrived: activates/extends the subscription. */
export async function confirmSubscriptionPayment(paymentId: string): Promise<SubscriptionPaymentDecisionResult> {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
  if (!payment) return { ok: false, error: "Paiement introuvable." };
  if (payment.status !== "pending") return { ok: false, error: "Ce paiement a déjà été traité." };

  const plan = planForAmount(payment.amount);
  const school = await prisma.school.findUniqueOrThrow({ where: { id: payment.schoolId } });
  const now = new Date();
  // An active subscription extends from its current end date, so confirming a
  // payment early never costs the school the days it already paid for.
  const base =
    school.subscriptionStatus === "active" && school.subscriptionRenewsAt && school.subscriptionRenewsAt > now
      ? new Date(school.subscriptionRenewsAt)
      : now;
  const renewsAt = new Date(base);
  renewsAt.setDate(renewsAt.getDate() + plan.durationDays);

  await prisma.$transaction([
    prisma.subscriptionPayment.update({ where: { id: paymentId }, data: { status: "success" } }),
    prisma.school.update({
      where: { id: payment.schoolId },
      data: { subscriptionStatus: "active", subscriptionRenewsAt: renewsAt },
    }),
  ]);

  return { ok: true, schoolId: payment.schoolId };
}

/** Admin rejects a pending payment: the money never arrived, wrong amount, etc. */
export async function rejectSubscriptionPayment(paymentId: string): Promise<SubscriptionPaymentDecisionResult> {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
  if (!payment) return { ok: false, error: "Paiement introuvable." };
  if (payment.status !== "pending") return { ok: false, error: "Ce paiement a déjà été traité." };

  await prisma.subscriptionPayment.update({ where: { id: paymentId }, data: { status: "failed" } });
  return { ok: true, schoolId: payment.schoolId };
}
