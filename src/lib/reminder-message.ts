import { computeStudentSummary, type StudentWithPayments, type TrancheState } from "@/lib/tuition";
import { formatAmount, formatDate } from "@/lib/format";

/**
 * What a reminder says, and which tranche it is about. Pure — no "server-only":
 * the very same computation runs on the server (`reminders-core.ts`) and on the
 * device, where a rappel prepared without a network is built from the local copy
 * of the school's data.
 *
 * A reminder does not read the same before and after the due date, nor when a
 * family has let several tranches slip: each of those three situations has its
 * own message, and the school can reword each one per class.
 */

export type ReminderSituation = "a_venir" | "retard" | "retards_multiples";

export type ReminderTemplates = Record<ReminderSituation, string>;

export type ReminderVars = {
  parent: string;
  tranche: string;
  eleve: string;
  classe: string;
  montant: string;
  echeance: string;
  ecole: string;
  /** "12 jours" — how late the (oldest) overdue tranche is. */
  retard?: string;
  /** How many tranches are overdue. */
  nombre?: string;
  /** One line per overdue tranche: label, amount, due date, days late. */
  detail?: string;
};

export function fillReminderTemplate(template: string, vars: ReminderVars) {
  return template
    .replaceAll("{parent}", vars.parent)
    .replaceAll("{tranche}", vars.tranche)
    .replaceAll("{eleve}", vars.eleve)
    .replaceAll("{classe}", vars.classe)
    .replaceAll("{montant}", vars.montant)
    .replaceAll("{echeance}", vars.echeance)
    .replaceAll("{ecole}", vars.ecole)
    .replaceAll("{retard}", vars.retard ?? "")
    .replaceAll("{nombre}", vars.nombre ?? "1")
    .replaceAll("{detail}", vars.detail ?? "");
}

/** The upcoming-instalment message — also the one every class stored until now. */
export const DEFAULT_REMINDER_TEMPLATE =
  "Bonjour {parent}, la {tranche} de la scolarité de {eleve} ({classe}), d'un montant de {montant} CFA, est attendue le {echeance}. Merci. — {ecole}";

export const DEFAULT_REMINDER_TEMPLATES: ReminderTemplates = {
  a_venir: DEFAULT_REMINDER_TEMPLATE,
  retard:
    "Bonjour {parent}, la {tranche} de la scolarité de {eleve} ({classe}), d'un montant de {montant} CFA, était attendue le {echeance}. Elle a maintenant {retard} de retard. Merci de passer la régler dès que possible. — {ecole}",
  retards_multiples:
    "Bonjour {parent}, la scolarité de {eleve} ({classe}) est en retard sur {nombre} tranches :\n{detail}\nTotal à régulariser : {montant} CFA. Merci de passer à l'école dès que possible pour régler ce retard. — {ecole}",
};

export const REMINDER_SITUATIONS: { key: ReminderSituation; title: string; hint: string; variables: string[] }[] = [
  {
    key: "a_venir",
    title: "Échéance à venir",
    hint: "La prochaine tranche n'est pas encore due.",
    variables: ["{parent}", "{eleve}", "{classe}", "{tranche}", "{montant}", "{echeance}", "{ecole}"],
  },
  {
    key: "retard",
    title: "Une tranche en retard",
    hint: "L'échéance d'une tranche est passée et elle n'est pas soldée.",
    variables: ["{parent}", "{eleve}", "{classe}", "{tranche}", "{montant}", "{echeance}", "{retard}", "{ecole}"],
  },
  {
    key: "retards_multiples",
    title: "Plusieurs tranches en retard",
    hint: "Le parent cumule des retards : le message les liste toutes, avec le total dû.",
    variables: ["{parent}", "{eleve}", "{classe}", "{nombre}", "{detail}", "{montant}", "{echeance}", "{ecole}"],
  },
];

/**
 * A class stores its messages in the single `reminderMessageTemplate` column:
 * as JSON once the school has worded the three situations, or — as every class
 * did before — as one plain template, which then only covers "à venir" (its
 * wording, "est attendue le…", would be wrong for a late tranche).
 */
export function parseReminderTemplates(raw: string | null | undefined): ReminderTemplates {
  const value = (raw ?? "").trim();
  if (!value) return { ...DEFAULT_REMINDER_TEMPLATES };

  if (value.startsWith("{") && value.endsWith("}")) {
    try {
      const parsed = JSON.parse(value) as Partial<Record<ReminderSituation, unknown>>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const pick = (key: ReminderSituation) => {
          const text = parsed[key];
          return typeof text === "string" && text.trim() ? text : DEFAULT_REMINDER_TEMPLATES[key];
        };
        return { a_venir: pick("a_venir"), retard: pick("retard"), retards_multiples: pick("retards_multiples") };
      }
    } catch {
      /* not JSON after all: a single template that happens to be wrapped in braces */
    }
  }

  return { ...DEFAULT_REMINDER_TEMPLATES, a_venir: value };
}

/** What goes back into the column: nothing at all while the school keeps the defaults. */
export function serializeReminderTemplates(templates: Partial<ReminderTemplates>): string | null {
  // A submitted textarea ends its lines with CR LF; WhatsApp only needs LF.
  const tidy = (text: string | undefined) => text?.replace(/\r\n?/g, "\n").trim();
  const clean: ReminderTemplates = {
    a_venir: tidy(templates.a_venir) || DEFAULT_REMINDER_TEMPLATES.a_venir,
    retard: tidy(templates.retard) || DEFAULT_REMINDER_TEMPLATES.retard,
    retards_multiples: tidy(templates.retards_multiples) || DEFAULT_REMINDER_TEMPLATES.retards_multiples,
  };
  const allDefault = (Object.keys(clean) as ReminderSituation[]).every(
    (key) => clean[key] === DEFAULT_REMINDER_TEMPLATES[key]
  );
  return allDefault ? null : JSON.stringify(clean);
}

export type ReminderPreview =
  | {
      ok: true;
      studentId: string;
      trancheId: string | null;
      phone: string;
      message: string;
      label: string;
      situation: ReminderSituation;
    }
  | { ok: false; skipped: string };

type Summary = ReturnType<typeof computeStudentSummary>;

const isTuition = (t: TrancheState) => t.tranche.kind !== "registration";

function pickTargetTranche(summary: Summary, trancheId?: string | null) {
  if (trancheId) {
    const explicit = summary.trancheStates.find((t) => t.tranche.id === trancheId);
    if (explicit) return explicit;
  }
  // Remind about an actual tuition instalment first; the enrolment fee only
  // reads correctly in "la {tranche} de la scolarité" as a last resort.
  return (
    summary.overdueTranches.find(isTuition) ??
    summary.trancheStates.find((t) => t.status !== "paid" && isTuition(t)) ??
    summary.overdueTranches[0] ??
    summary.trancheStates.find((t) => t.status !== "paid") ??
    null
  );
}

function daysLabel(days: number) {
  const n = Math.max(1, days);
  return `${n} jour${n > 1 ? "s" : ""}`;
}

/** The oldest overdue tranche first — that is the one the family is furthest behind on. */
function overdueByAge(summary: Summary) {
  return [...summary.overdueTranches].sort(
    (a, b) => a.tranche.dueDate.getTime() - b.tranche.dueDate.getTime() || a.tranche.order - b.tranche.order
  );
}

function detailLines(overdue: TrancheState[]) {
  return overdue
    .map(
      (t) =>
        `• ${t.tranche.label} : ${formatAmount(t.remaining)} CFA, échéance du ${formatDate(t.tranche.dueDate)} (${daysLabel(
          t.daysLate
        )} de retard)`
    )
    .join("\n");
}

function joinLabels(labels: string[]) {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
}

function baseVars(student: StudentWithPayments, schoolName: string) {
  return {
    parent: student.parentName || "Parent",
    eleve: `${student.firstName} ${student.lastName}`,
    classe: student.class.name,
    ecole: schoolName,
  };
}

/**
 * The situation and the values its message needs. With several tranches
 * overdue, `{montant}` is what the family owes on all of them together and
 * `{echeance}` the oldest missed date.
 */
function composeReminder(student: StudentWithPayments, schoolName: string, summary: Summary, trancheId?: string | null) {
  const overdue = overdueByAge(summary);

  if (!trancheId && overdue.length >= 2) {
    const oldest = overdue[0];
    const vars: ReminderVars = {
      ...baseVars(student, schoolName),
      tranche: joinLabels(overdue.map((t) => t.tranche.label)),
      montant: formatAmount(overdue.reduce((sum, t) => sum + t.remaining, 0)),
      echeance: formatDate(oldest.tranche.dueDate),
      retard: daysLabel(oldest.daysLate),
      nombre: String(overdue.length),
      detail: detailLines(overdue),
    };
    return { situation: "retards_multiples" as const, target: oldest, vars };
  }

  // A single overdue tranche is what the message is about, even the enrolment
  // fee: talking about the next instalment instead would hide the late one.
  const target = !trancheId && overdue.length === 1 ? overdue[0] : pickTargetTranche(summary, trancheId);
  // The template reads "la {tranche} de la scolarité". A tuition instalment
  // ("1re tranche") fits; the enrolment fee ("Frais d'inscription") does not
  // ("la Frais…"), so use the neutral phrase there.
  const trancheLabel = !target || target.tranche.kind === "registration" ? "part restante" : target.tranche.label;
  const late = target?.status === "late";
  const vars: ReminderVars = {
    ...baseVars(student, schoolName),
    tranche: trancheLabel,
    montant: formatAmount(target ? target.remaining : summary.remaining),
    echeance: target ? formatDate(target.tranche.dueDate) : "dès que possible",
    retard: late ? daysLabel(target.daysLate) : "",
    nombre: late ? "1" : "0",
    detail: target && late ? detailLines([target]) : "",
  };
  return { situation: late ? ("retard" as const) : ("a_venir" as const), target, vars };
}

/**
 * The rappel for one student. `trancheId` narrows it to a single tranche (a
 * reminder about that instalment alone); without it the message covers the
 * student's whole situation, every overdue tranche included.
 */
export function previewForStudent(
  student: StudentWithPayments,
  schoolName: string,
  trancheId?: string | null,
  now?: Date
): ReminderPreview {
  if (!student.parentPhone) return { ok: false, skipped: "Aucun numéro de parent enregistré." };

  const summary = computeStudentSummary(student, now ?? new Date());
  if (summary.status === "non_defini") {
    return { ok: false, skipped: "Scolarité de la classe non configurée." };
  }
  if (summary.remaining <= 0) {
    return { ok: false, skipped: "Cet élève est à jour — aucun rappel à envoyer." };
  }

  const { situation, target, vars } = composeReminder(student, schoolName, summary, trancheId);
  const templates = parseReminderTemplates(student.class.reminderMessageTemplate);
  const message = fillReminderTemplate(templates[situation], vars);

  return {
    ok: true,
    studentId: student.id,
    trancheId: target?.tranche.id ?? null,
    phone: student.parentPhone,
    message,
    label: `${student.firstName} ${student.lastName}`,
    situation,
  };
}

/** A made-up family, so the class configuration can show each message filled in. */
export const SAMPLE_REMINDER_VARS: Record<ReminderSituation, ReminderVars> = {
  a_venir: {
    parent: "M. OUEDRAOGO",
    tranche: "2e tranche",
    eleve: "Awa OUEDRAOGO",
    classe: "CM1",
    montant: "25 000",
    echeance: "15/01/2027",
    ecole: "votre école",
  },
  retard: {
    parent: "M. OUEDRAOGO",
    tranche: "1re tranche",
    eleve: "Awa OUEDRAOGO",
    classe: "CM1",
    montant: "25 000",
    echeance: "15/10/2026",
    retard: "12 jours",
    nombre: "1",
    detail: "• 1re tranche : 25 000 CFA, échéance du 15/10/2026 (12 jours de retard)",
    ecole: "votre école",
  },
  retards_multiples: {
    parent: "M. OUEDRAOGO",
    tranche: "1re tranche et 2e tranche",
    eleve: "Awa OUEDRAOGO",
    classe: "CM1",
    montant: "50 000",
    echeance: "15/10/2026",
    retard: "93 jours",
    nombre: "2",
    detail:
      "• 1re tranche : 25 000 CFA, échéance du 15/10/2026 (93 jours de retard)\n• 2e tranche : 25 000 CFA, échéance du 15/01/2027 (1 jour de retard)",
    ecole: "votre école",
  },
};
