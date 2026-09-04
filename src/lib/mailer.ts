import "server-only";

export type EmailSendResult = {
  ok: boolean;
  mode: "live" | "mock";
  error?: string;
};

function isConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_FROM_EMAIL);
}

/**
 * Sends an email via the Brevo API, from a single verified sender address
 * (no domain needed — see https://app.brevo.com/senders/list).
 *
 * Falls back to a mock/dev mode when BREVO_API_KEY or BREVO_FROM_EMAIL isn't
 * set, so flows like password reset work end-to-end without live
 * credentials. Wire real values in .env to send actual emails.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<EmailSendResult> {
  if (!isConfigured()) {
    console.log(`[email:mock] to=${to} subject=${JSON.stringify(subject)} body=${JSON.stringify(text)}`);
    return { ok: true, mode: "mock" };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY!,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: process.env.BREVO_FROM_EMAIL, name: "Bangre" },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const error = data?.message ?? `Erreur email (${res.status})`;
      return { ok: false, mode: "live", error };
    }
    return { ok: true, mode: "live" };
  } catch (err) {
    return { ok: false, mode: "live", error: err instanceof Error ? err.message : "Erreur réseau" };
  }
}
