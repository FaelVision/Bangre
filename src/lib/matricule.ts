// Matricule generation. The user can always override the suggested value.

const PREFIX = "BG-";
const START = 450;

/** Extract the numeric part of a matricule, or null when there is none. */
export function matriculeNumber(matricule: string): number | null {
  const n = Number((matricule ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Suggest the next matricule given the ones already used in the school. */
export function nextMatricule(existing: string[]): string {
  const numbers = existing.map(matriculeNumber).filter((n): n is number => n !== null);
  const max = numbers.length ? Math.max(...numbers) : START;
  return `${PREFIX}${max + 1}`;
}

/** Normalise a user-typed matricule (trim, collapse spaces, uppercase). */
export function normalizeMatricule(raw: string): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}
