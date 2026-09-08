/**
 * Pure — no "server-only": the reminder/payment-confirmation flows let the
 * user edit the message before it's sent, so the final wa.me URL is built
 * client-side (from the edited text) at the moment the user clicks "Ouvrir
 * WhatsApp", not baked in ahead of time on the server.
 */
export function buildWhatsAppLink(phoneE164: string, message: string): string {
  const digits = phoneE164.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
