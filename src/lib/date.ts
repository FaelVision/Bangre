// Helpers to let users type a date as "26/11/2006" instead of using a date picker.

/** Format the digits a user is typing into "jj/mm/aaaa" as they go. */
export function autoFormatDate(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join("/");
}

/**
 * Parse a human date into an ISO "YYYY-MM-DD" string.
 * Accepts "26/11/2006", "26-11-2006", "26.11.2006", "26/11/06" and ISO strings.
 * Returns "" when the input cannot be understood.
 */
export function frToIso(input: string): string {
  const s = (input ?? "").trim();
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isValidYmd(s) ? s : "";

  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (!m) return "";

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (m[3].length <= 2) year += year > 50 ? 1900 : 2000;

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isValidYmd(iso) ? iso : "";
}

function isValidYmd(iso: string): boolean {
  const [y, mo, d] = iso.split("-").map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Format a stored date (or ISO/human string) back into "jj/mm/aaaa" for display in an input. */
export function isoToFr(input: string | Date | null | undefined): string {
  if (!input) return "";
  if (typeof input === "string") {
    const iso = frToIso(input);
    if (!iso) return input;
    const [y, mo, d] = iso.split("-");
    return `${d}/${mo}/${y}`;
  }
  const d = input;
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** Parse a human or ISO date into a Date (UTC midnight), or null when invalid/empty. */
export function parseDateInput(input: string | null | undefined): Date | null {
  const iso = frToIso(input ?? "");
  if (!iso) return null;
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}
