"use server";

import { redirect } from "next/navigation";
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
