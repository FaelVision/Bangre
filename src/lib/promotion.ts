const PRIMAIRE_SEQUENCE = ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"];

/**
 * Best-effort guess at the class a student moves into next year. Editable
 * by the secretary before validating — this is a starting point, not a
 * source of truth.
 */
export function guessNextClassName(name: string): string {
  const trimmed = name.trim();

  const primaireIndex = PRIMAIRE_SEQUENCE.indexOf(trimmed.toUpperCase());
  if (primaireIndex >= 0) {
    if (primaireIndex === PRIMAIRE_SEQUENCE.length - 1) return "6e";
    return PRIMAIRE_SEQUENCE[primaireIndex + 1];
  }

  const match = trimmed.match(/^(\d+)(e|ère|re|nde|ᵉ|ⁿᵈᵉ)\s*([A-Za-z]?)$/i);
  if (match) {
    const grade = match[1];
    const suffix = match[3] ? ` ${match[3].toUpperCase()}` : "";
    const nextGrade: Record<string, string> = { "6": "5e", "5": "4e", "4": "3e", "3": "2nde", "2": "1ère" };
    if (nextGrade[grade]) return `${nextGrade[grade]}${suffix}`;
    if (grade === "1") return `Tle${suffix}`;
  }

  if (/^tle/i.test(trimmed)) return "Diplômé(e)";

  return `${trimmed} (suivante)`;
}

export function nextAcademicYearLabel(current: string): string {
  const match = current.match(/(\d{4})-(\d{4})/);
  if (!match) return current;
  const start = Number(match[1]) + 1;
  return `${start}-${start + 1}`;
}
