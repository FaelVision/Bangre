"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { chargeMobileMoney, type MobileMoneyProvider } from "@/lib/mobilemoney";
import { normalizePhone } from "@/lib/validation";

const SUBSCRIPTION_AMOUNT = 5000;

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

  const result = await chargeMobileMoney(provider, phone, SUBSCRIPTION_AMOUNT);

  await prisma.subscriptionPayment.create({
    data: {
      schoolId,
      amount: SUBSCRIPTION_AMOUNT,
      provider,
      phone,
      status: result.ok ? "success" : "failed",
      reference: result.reference,
    },
  });

  if (!result.ok) {
    return { error: result.error ?? "Le paiement a échoué. Réessayez." };
  }

  const renewsAt = new Date();
  renewsAt.setDate(renewsAt.getDate() + 30);
  await prisma.school.update({
    where: { id: schoolId },
    data: { subscriptionStatus: "active", subscriptionRenewsAt: renewsAt },
  });

  redirect("/tableau-de-bord");
}

export async function continueTrialAction() {
  await verifySession();
  redirect("/tableau-de-bord");
}
