import "server-only";

export type WhatsAppSendResult = {
  ok: boolean;
  mode: "live" | "mock";
  providerMessageId?: string;
  error?: string;
};

function isConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

const TEMPLATE_LANGUAGE = "fr";

/**
 * Sends a pre-approved WhatsApp Message Template via the Meta Cloud API.
 *
 * WhatsApp only allows free-form text within 24h of the customer's last
 * message; every message Bangre sends (reminders, payment confirmations,
 * password reset links) is business-initiated, so it must go through an
 * approved template instead of plain text. `params` are substituted in
 * order for {{1}}, {{2}}… in the template body — see Meta Business Manager
 * > WhatsApp Manager > Message Templates for the approved templates this
 * app expects (category UTILITY, language fr): rappel_paiement,
 * confirmation_paiement, reinitialisation_mdp.
 *
 * Falls back to mock/dev mode when WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID
 * aren't set, so reminder/payment/reset flows work end-to-end without live
 * credentials. Wire real values in .env to send actual messages.
 */
export async function sendWhatsAppTemplate(
  toPhoneE164: string,
  templateName: string,
  params: string[]
): Promise<WhatsAppSendResult> {
  if (!isConfigured()) {
    console.log(`[whatsapp:mock] to=${toPhoneE164} template=${templateName} params=${JSON.stringify(params)}`);
    return { ok: true, mode: "mock", providerMessageId: `mock-${Date.now()}` };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toPhoneE164.replace(/\s+/g, ""),
          type: "template",
          template: {
            name: templateName,
            language: { code: TEMPLATE_LANGUAGE },
            components: [
              {
                type: "body",
                parameters: params.map((text) => ({ type: "text", text })),
              },
            ],
          },
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, mode: "live", error: data?.error?.message ?? "Erreur WhatsApp API" };
    }
    return { ok: true, mode: "live", providerMessageId: data?.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, mode: "live", error: err instanceof Error ? err.message : "Erreur réseau" };
  }
}

/** Substitutes the named placeholders in a human-readable copy of a reminder — kept for the on-screen/stored history text, independent of the {{1}}, {{2}}… order sent to the live WhatsApp template. */
export function fillReminderTemplate(
  template: string,
  vars: {
    parent: string;
    tranche: string;
    eleve: string;
    classe: string;
    montant: string;
    echeance: string;
    ecole: string;
  }
) {
  return template
    .replaceAll("{parent}", vars.parent)
    .replaceAll("{tranche}", vars.tranche)
    .replaceAll("{eleve}", vars.eleve)
    .replaceAll("{classe}", vars.classe)
    .replaceAll("{montant}", vars.montant)
    .replaceAll("{echeance}", vars.echeance)
    .replaceAll("{ecole}", vars.ecole);
}

export const DEFAULT_REMINDER_TEMPLATE =
  "Bonjour {parent}, la {tranche} de la scolarité de {eleve} ({classe}), d'un montant de {montant} CFA, est attendue le {echeance}. Merci. — {ecole}";
