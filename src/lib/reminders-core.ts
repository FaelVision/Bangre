import "server-only";
import { prisma } from "@/lib/db";
import { type StudentWithPayments } from "@/lib/tuition";
import { previewForStudent, type ReminderPreview } from "@/lib/reminder-message";

/**
 * Loading a student and recording that a reminder was sent. What the message
 * actually says lives in `reminder-message.ts`, shared with the device so a
 * rappel prepared offline reads exactly like one prepared online.
 */

export type { ReminderPreview };

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
