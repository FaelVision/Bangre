const numberFormatter = new Intl.NumberFormat("fr-FR");

export function formatAmount(amount: number) {
  return numberFormatter.format(Math.round(amount));
}

export function formatCFA(amount: number) {
  return `${formatAmount(amount)} CFA`;
}

export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(date: Date | string | null | undefined) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function initials(firstName: string, lastName: string) {
  return `${lastName.charAt(0)}${firstName.charAt(0)}`.toUpperCase();
}

export function ageFromBirthDate(birthDate: Date | string | null | undefined) {
  if (!birthDate) return null;
  const d = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function daysBetween(a: Date, b: Date) {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function daysUntil(date: Date) {
  return Math.max(0, Math.ceil(daysBetween(date, new Date())));
}
