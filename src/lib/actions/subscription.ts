"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { normalizePhone } from "@/lib/validation";
import { recordSubscriptionPayment } from "@/lib/subscription-core";

export type SubscriptionActionState = { error?: string } | undefined;

export async function paySubscriptionAction(
  _prevState: SubscriptionActionState,
  formData: FormData
): Promise<SubscriptionActionState> {
  const { schoolId } = await verifySession();

  const provider = formData.get("provider") as string;
  const phoneRaw = formData.get("phone") as string;
  if (!provider || !phoneRaw) {
    return { error: "Sélectionnez un opérateur et un numéro." };
  }
  const phone = normalizePhone(phoneRaw);
  const planId = formData.get("plan") as string;

  const result = await recordSubscriptionPayment(schoolId, { provider, phone, planId });
  if (!result.ok) return { error: result.error };

  redirect("/abonnement");
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
