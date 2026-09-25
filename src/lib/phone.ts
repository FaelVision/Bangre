/**
 * Phone normalisation, kept apart from `validation.ts` so the device can reuse
 * it without pulling the whole schema library into the offline bundle.
 */
export function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d]/g, "");
  const local = digits.startsWith("226") ? digits.slice(3) : digits;
  return `+226${local}`;
}
