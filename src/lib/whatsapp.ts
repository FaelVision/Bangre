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

/**
 * Sends a WhatsApp message via the Meta WhatsApp Cloud API.
 *
 * Falls back to a mock/dev mode when WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID
 * aren't set, so the reminder flow works end-to-end (recorded in the DB) without
 * live credentials. Wire real credentials in .env to send actual messages.
 */
export async function sendWhatsAppMessage(
  toPhoneE164: string,
  message: string
): Promise<WhatsAppSendResult> {
  if (!isConfigured()) {
    console.log(`[whatsapp:mock] to=${toPhoneE164} message=${JSON.stringify(message)}`);
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
          type: "text",
          text: { body: message },
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
