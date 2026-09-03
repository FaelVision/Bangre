"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { chargeMobileMoney, type MobileMoneyProvider } from "@/lib/mobilemoney";
import { normalizePhone } from "@/lib/validation";
import { getPlan } from "@/lib/plans";

export type SubscriptionActionState = { error?: string } | undefined;

export async function paySubscriptionAction(
  _prevState: SubscriptionActionState,
  formData: FormData
): Promise<SubscriptionActionState> {
  const { schoolId } = await verifySession();

  const provider = formData.get("provider") as MobileMoneyProvider;
  const phoneRaw = formData.get("phone") as string;
  if (!provider || !phoneRaw) {
    return { error: "Sélectionnez un opérateur et un numéro." };
  }
  const phone = normalizePhone(phoneRaw);
  const plan = getPlan(formData.get("plan") as string);

  const result = await chargeMobileMoney(provider, phone, plan.amount);

  await prisma.subscriptionPayment.create({
    data: {
      schoolId,
      amount: plan.amount,
      provider,
      phone,
      status: result.ok ? "success" : "failed",
      reference: result.reference,
    },
  });

  if (!result.ok) {
    return { error: result.error ?? "Le paiement a échoué. Réessayez." };
  }

  // An active subscription extends from its current end date, so paying early
  // never costs the school the days it already paid for.
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
  const now = new Date();
  const base =
    school.subscriptionStatus === "active" && school.subscriptionRenewsAt && school.subscriptionRenewsAt > now
      ? new Date(school.subscriptionRenewsAt)
      : now;
  const renewsAt = new Date(base);
  renewsAt.setDate(renewsAt.getDate() + plan.durationDays);
  await prisma.school.update({
    where: { id: schoolId },
    data: { subscriptionStatus: "active", subscriptionRenewsAt: renewsAt },
  });

  redirect("/tableau-de-bord");
}

export async function continueTrialAction() {
  const { schoolId } = await verifySession();
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });

  // "Continue on trial" is only a real option while the trial actually lasts.
  // Once it (or a paid period) has lapsed, the school must pay to get back in —
  // otherwise this button would be a free permanent bypass.
  const trialActive = school.trialEndsAt ? school.trialEndsAt.getTime() > Date.now() : false;
  const paidActive =
    school.subscriptionStatus === "active" &&
    (!school.subscriptionRenewsAt || school.subscriptionRenewsAt.getTime() > Date.now());

  if (!trialActive && !paidActive) {
    redirect("/abonnement?expire=1");
  }
  redirect("/tableau-de-bord");
}
