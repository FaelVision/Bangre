import "server-only";
import { prisma } from "@/lib/db";
import {
  computeStudentSummary,
  type StudentWithPayments,
} from "@/lib/tuition";
import { fillReminderTemplate, DEFAULT_REMINDER_TEMPLATE } from "@/lib/whatsapp";
import { formatAmount } from "@/lib/format";

/**
 * Building a reminder's message and actually recording it as sent are two
 * separate steps: the user gets to review/edit the message before WhatsApp
 * opens, so nothing is written to the DB until they confirm (see
 * `recordReminderSent`). This just computes what the message *should* say
 * for a student's current situation — it touches no database write.
 */
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

function previewForStudent(
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

/** Single "Envoyer un rappel" button for one student — no DB write yet. */
export async function previewReminder(schoolId: string, studentId: string): Promise<ReminderPreview> {
  const [student, school] = await Promise.all([
    prisma.student.findFirst({
      where: { id: studentId, schoolId },
      include: { class: { include: { tranches: true } }, payments: { include: { allocations: true } } },
    }) as Promise<StudentWithPayments | null>,
    prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } }),
  ]);
  if (!student) return { ok: false, skipped: "Élève introuvable." };
  return previewForStudent(student, school.name);
}

/** Bulk "Envoyer les rappels" — one preview per eligible student, no DB write yet. */
export async function previewReminders(schoolId: string, studentIds: string[]) {
  const [students, school] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId },
      include: { class: { include: { tranches: true } }, payments: { include: { allocations: true } } },
    }) as Promise<StudentWithPayments[]>,
    prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } }),
  ]);

  const prepared: Extract<ReminderPreview, { ok: true }>[] = [];
  let skipped = 0;
  for (const student of students) {
    const res = previewForStudent(student, school.name);
    if (res.ok) prepared.push(res);
    else skipped += 1;
  }
  return { prepared, skipped, total: students.length };
}

/**
 * Called once the user actually clicks "Ouvrir WhatsApp" — records the
 * message as sent, including any edits they made to the preview. `message`
 * is trusted as final: whatever text the user reviewed and opened is what
 * gets logged, whether or not it matches the auto-generated preview.
 */
export async function recordReminderSent(
  schoolId: string,
  studentId: string,
  trancheId: string | null,
  message: string
) {
  const reminder = await prisma.reminder.create({
    data: { schoolId, studentId, trancheId, channel: "whatsapp", trigger: "manual", status: "sent", message },
  });
  return { ok: true as const, reminderId: reminder.id };
}
