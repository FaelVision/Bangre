import { computeStudentSummary, type StudentWithPayments } from "@/lib/tuition";
import { formatAmount } from "@/lib/format";

/**
 * What a reminder says, and which tranche it is about. Pure — no "server-only":
 * the very same computation runs on the server (`reminders-core.ts`) and on the
 * device, where a rappel prepared without a network is built from the local copy
 * of the school's data.
 */

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

export type ReminderPreview =
  | { ok: true; studentId: string; trancheId: string | null; phone: string; message: string; label: string }
  | { ok: false; skipped: string };

function pickTargetTranche(summary: ReturnType<typeof computeStudentSummary>, trancheId?: string | null) {
  if (trancheId) {
    const explicit = summary.trancheStates.find((t) => t.tranche.id === trancheId);
    if (explicit) return explicit;
  }
  // Remind about an actual tuition instalment first; the enrolment fee only
  // reads correctly in "la {tranche} de la scolarité" as a last resort.
  const isTuition = (t: (typeof summary.trancheStates)[number]) => t.tranche.kind !== "registration";
  return (
    summary.overdueTranches.find(isTuition) ??
    summary.trancheStates.find((t) => t.status !== "paid" && isTuition(t)) ??
    summary.overdueTranches[0] ??
    summary.trancheStates.find((t) => t.status !== "paid") ??
    null
  );
}

function reminderVars(
  student: StudentWithPayments,
  schoolName: string,
  target: ReturnType<typeof pickTargetTranche>,
  summary: ReturnType<typeof computeStudentSummary>
) {
  // The template reads "la {tranche} de la scolarité". A tuition instalment
  // ("1re tranche") fits; the enrolment fee ("Frais d'inscription") does not
  // ("la Frais…"), so use the neutral phrase there.
  const trancheLabel =
    !target || target.tranche.kind === "registration" ? "part restante" : target.tranche.label;
  return {
    parent: student.parentName || "Parent",
    tranche: trancheLabel,
    eleve: `${student.firstName} ${student.lastName}`,
    classe: student.class.name,
    montant: formatAmount(target ? target.remaining : summary.remaining),
    echeance: target ? target.tranche.dueDate.toLocaleDateString("fr-FR") : "dès que possible",
    ecole: schoolName,
  };
}

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

  const target = pickTargetTranche(summary, trancheId);
  const vars = reminderVars(student, schoolName, target, summary);
  const template = student.class.reminderMessageTemplate || DEFAULT_REMINDER_TEMPLATE;
  const message = fillReminderTemplate(template, vars);

  return {
    ok: true,
    studentId: student.id,
    trancheId: target?.tranche.id ?? null,
    phone: student.parentPhone,
    message,
    label: `${student.firstName} ${student.lastName}`,
  };
}
