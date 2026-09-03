import "server-only";
import { prisma } from "@/lib/db";
import {
  computeStudentSummary,
  type StudentWithPayments,
} from "@/lib/tuition";
import { sendWhatsAppMessage, fillReminderTemplate, DEFAULT_REMINDER_TEMPLATE } from "@/lib/whatsapp";
import { formatAmount } from "@/lib/format";
import { getActiveStudentsWithSummary } from "@/lib/queries";
import {
  computeReminderActions,
  parseAfterDays,
  type AutoTrigger,
  type ClassReminderConfig,
  type SentIndex,
  type StudentSnapshot,
} from "@/lib/reminder-schedule";

export type ReminderTrigger = "manual" | AutoTrigger;

/**
 * The single place a payment reminder is built, sent and recorded — shared by
 * the manual buttons (Server Actions), the offline queue replay (`/api/sync`)
 * and the hourly scheduler (`/api/cron/reminders`), so every path applies the
 * same template, the same "nothing owed → don't send" rule and the same
 * bookkeeping.
 */
export type SendReminderResult =
  | { ok: true; reminderId: string; mode: "live" | "mock" }
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

function buildMessage(
  student: StudentWithPayments,
  schoolName: string,
  target: ReturnType<typeof pickTargetTranche>,
  summary: ReturnType<typeof computeStudentSummary>
) {
  const template = student.class.reminderMessageTemplate || DEFAULT_REMINDER_TEMPLATE;
  // The template reads "la {tranche} de la scolarité". A tuition instalment
  // ("1re tranche") fits; the enrolment fee ("Frais d'inscription") does not
  // ("la Frais…"), so use the neutral phrase there.
  const trancheLabel =
    !target || target.tranche.kind === "registration" ? "part restante" : target.tranche.label;
  return fillReminderTemplate(template, {
    parent: student.parentName || "Parent",
    tranche: trancheLabel,
    eleve: `${student.firstName} ${student.lastName}`,
    classe: student.class.name,
    montant: formatAmount(target ? target.remaining : summary.remaining),
    echeance: target ? target.tranche.dueDate.toLocaleDateString("fr-FR") : "dès que possible",
    ecole: schoolName,
  });
}

export async function sendReminderForStudent(params: {
  schoolId: string;
  student: StudentWithPayments;
  schoolName: string;
  trigger: ReminderTrigger;
  trancheId?: string | null;
  now?: Date;
}): Promise<SendReminderResult> {
  const { schoolId, student, schoolName, trigger, trancheId, now } = params;

  if (!student.parentPhone) return { ok: false, skipped: "Aucun numéro de parent enregistré." };

  const summary = computeStudentSummary(student, now ?? new Date());
  if (summary.status === "non_defini") {
    return { ok: false, skipped: "Scolarité de la classe non configurée." };
  }
  if (summary.remaining <= 0) {
    return { ok: false, skipped: "Cet élève est à jour — aucun rappel à envoyer." };
  }

  const target = pickTargetTranche(summary, trancheId);
  const message = buildMessage(student, schoolName, target, summary);
  const result = await sendWhatsAppMessage(student.parentPhone, message);

  const reminder = await prisma.reminder.create({
    data: {
      schoolId,
      studentId: student.id,
      trancheId: target?.tranche.id ?? null,
      channel: "whatsapp",
      trigger,
      status: result.ok ? "sent" : "failed",
      providerMessageId: result.providerMessageId ?? null,
      message,
    },
  });

  if (!result.ok) return { ok: false, skipped: result.error ?? "Envoi WhatsApp échoué." };
  return { ok: true, reminderId: reminder.id, mode: result.mode };
}

/** Manual "Envoyer un rappel" for one student. */
export async function sendManualReminder(schoolId: string, studentId: string): Promise<SendReminderResult> {
  const [student, school] = await Promise.all([
    prisma.student.findFirst({
      where: { id: studentId, schoolId },
      include: { class: { include: { tranches: true } }, payments: { include: { allocations: true } } },
    }) as Promise<StudentWithPayments | null>,
    prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } }),
  ]);
  if (!student) return { ok: false, skipped: "Élève introuvable." };
  return sendReminderForStudent({ schoolId, student, schoolName: school.name, trigger: "manual" });
}

export async function sendManualReminders(schoolId: string, studentIds: string[]) {
  const [students, school] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId },
      include: { class: { include: { tranches: true } }, payments: { include: { allocations: true } } },
    }) as Promise<StudentWithPayments[]>,
    prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } }),
  ]);

  let sent = 0;
  for (const student of students) {
    const res = await sendReminderForStudent({ schoolId, student, schoolName: school.name, trigger: "manual" });
    if (res.ok) sent += 1;
  }
  return { sent, total: students.length };
}

// ---------------------------------------------------------------------------
// Hourly scheduler — one school
// ---------------------------------------------------------------------------

export type SchoolReminderRun = {
  schoolId: string;
  considered: number;
  sent: number;
  failed: number;
};

export async function runSchoolReminders(
  school: { id: string; name: string },
  now: Date = new Date()
): Promise<SchoolReminderRun> {
  const [classes, rows, recentReminders] = await Promise.all([
    prisma.schoolClass.findMany({
      where: { schoolId: school.id, archived: false },
      select: {
        id: true,
        reminderEnabled: true,
        reminderBeforeDays: true,
        reminderAfterDays: true,
        reminderHour: true,
      },
    }),
    getActiveStudentsWithSummary(school.id),
    prisma.reminder.findMany({
      where: {
        schoolId: school.id,
        sentAt: { gte: new Date(now.getTime() - 120 * 86_400_000) },
      },
      select: { studentId: true, trancheId: true, trigger: true, sentAt: true },
    }),
  ]);

  const classConfigs: ClassReminderConfig[] = classes.map((c) => ({
    classId: c.id,
    reminderEnabled: c.reminderEnabled,
    reminderBeforeDays: c.reminderBeforeDays,
    reminderAfterDays: parseAfterDays(c.reminderAfterDays),
    reminderHour: c.reminderHour,
  }));

  const sent: SentIndex = new Map();
  const lastReminderAt = new Map<string, Date>();
  for (const r of recentReminders) {
    const prev = lastReminderAt.get(r.studentId);
    if (!prev || r.sentAt > prev) lastReminderAt.set(r.studentId, r.sentAt);
    if ((r.trigger === "auto_before" || r.trigger === "auto_after") && r.trancheId) {
      const key = `${r.studentId}:${r.trancheId}`;
      const entry = sent.get(key) ?? { auto_before: 0, auto_after: 0 };
      entry[r.trigger] += 1;
      sent.set(key, entry);
    }
  }

  const studentById = new Map(rows.map((row) => [row.student.id, row.student as StudentWithPayments]));
  const snapshots: StudentSnapshot[] = rows.map((row) => ({
    studentId: row.student.id,
    classId: row.student.classId,
    hasParentPhone: Boolean(row.student.parentPhone),
    lastReminderAt: lastReminderAt.get(row.student.id) ?? null,
    tranches: row.summary.trancheStates
      .filter((t) => t.remaining > 0)
      .map((t) => ({ trancheId: t.tranche.id, remaining: t.remaining, dueDate: t.tranche.dueDate })),
  }));

  const actions = computeReminderActions({ now, classes: classConfigs, students: snapshots, sent });

  let ok = 0;
  let failed = 0;
  for (const action of actions) {
    const student = studentById.get(action.studentId);
    if (!student) continue;
    const res = await sendReminderForStudent({
      schoolId: school.id,
      student,
      schoolName: school.name,
      trigger: action.trigger,
      trancheId: action.trancheId,
      now,
    });
    if (res.ok) ok += 1;
    else failed += 1;
  }

  return { schoolId: school.id, considered: actions.length, sent: ok, failed };
}
