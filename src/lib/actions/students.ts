"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { sendWhatsAppMessage, fillReminderTemplate, DEFAULT_REMINDER_TEMPLATE } from "@/lib/whatsapp";
import { computeStudentSummary, studentQueryInclude, type StudentWithPayments } from "@/lib/tuition";
import { normalizePhone } from "@/lib/validation";

export type StudentActionState = { error?: string } | undefined;

function nextMatricule(existing: string[]) {
  const numbers = existing
    .map((m) => Number(m.replace(/[^\d]/g, "")))
    .filter((n) => !Number.isNaN(n));
  const max = numbers.length ? Math.max(...numbers) : 450;
  return `BG-${max + 1}`;
}

export async function createStudentAction(
  _prevState: StudentActionState,
  formData: FormData
): Promise<StudentActionState> {
  const { schoolId } = await verifySession();
  const classId = formData.get("classId") as string;
  const lastName = (formData.get("lastName") as string)?.trim().toUpperCase();
  const firstName = (formData.get("firstName") as string)?.trim();
  const birthDateRaw = formData.get("birthDate") as string;
  const gender = formData.get("gender") as string;
  const parentName = (formData.get("parentName") as string)?.trim() || null;
  const parentPhoneRaw = (formData.get("parentPhone") as string)?.trim();

  if (!classId || !lastName || !firstName) {
    return { error: "Nom, prénom et classe sont requis." };
  }

  const clazz = await prisma.schoolClass.findFirst({ where: { id: classId, schoolId } });
  if (!clazz) return { error: "Classe introuvable." };

  const existingMatricules = (await prisma.student.findMany({ where: { schoolId }, select: { matricule: true } })).map(
    (s) => s.matricule
  );

  await prisma.student.create({
    data: {
      schoolId,
      classId,
      matricule: nextMatricule(existingMatricules),
      lastName,
      firstName,
      birthDate: birthDateRaw ? new Date(birthDateRaw) : null,
      gender: gender || null,
      parentName,
      parentPhone: parentPhoneRaw ? normalizePhone(parentPhoneRaw) : null,
      whatsappStatus: parentPhoneRaw ? "reachable" : "unknown",
    },
  });

  revalidatePath("/eleves");
  redirect(`/classes/${classId}/eleves`);
}

export async function updateStudentAction(
  studentId: string,
  _prevState: StudentActionState,
  formData: FormData
): Promise<StudentActionState> {
  const { schoolId } = await verifySession();
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) return { error: "Élève introuvable." };

  const lastName = (formData.get("lastName") as string)?.trim().toUpperCase();
  const firstName = (formData.get("firstName") as string)?.trim();
  const birthDateRaw = formData.get("birthDate") as string;
  const gender = formData.get("gender") as string;
  const parentName = (formData.get("parentName") as string)?.trim() || null;
  const parentPhoneRaw = (formData.get("parentPhone") as string)?.trim();
  const whatsappStatus = (formData.get("whatsappStatus") as string) || "unknown";

  await prisma.student.update({
    where: { id: studentId },
    data: {
      lastName,
      firstName,
      birthDate: birthDateRaw ? new Date(birthDateRaw) : null,
      gender: gender || null,
      parentName,
      parentPhone: parentPhoneRaw ? normalizePhone(parentPhoneRaw) : null,
      whatsappStatus,
    },
  });

  revalidatePath(`/eleves/${studentId}`);
  redirect(`/eleves/${studentId}`);
}

async function buildReminderMessage(row: StudentWithPayments) {
  const summary = computeStudentSummary(row);
  const nextDue = summary.overdueTranches[0] ?? summary.trancheStates.find((t) => t.status !== "paid");
  const template = row.class.reminderMessageTemplate || DEFAULT_REMINDER_TEMPLATE;
  return fillReminderTemplate(template, {
    parent: row.parentName || "Parent",
    tranche: nextDue?.tranche.label ?? "scolarité",
    eleve: `${row.firstName} ${row.lastName}`,
    classe: row.class.name,
    montant: nextDue ? String(nextDue.remaining) : String(summary.remaining),
    echeance: nextDue ? nextDue.tranche.dueDate.toLocaleDateString("fr-FR") : "",
    ecole: "l'établissement",
  });
}

export async function sendReminderAction(studentId: string) {
  const { schoolId } = await verifySession();
  const student = (await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    include: studentQueryInclude,
  })) as StudentWithPayments | null;
  if (!student) return { error: "Élève introuvable." };
  if (!student.parentPhone) return { error: "Aucun numéro de parent enregistré." };

  const message = await buildReminderMessage(student);
  const result = await sendWhatsAppMessage(student.parentPhone, message);

  await prisma.reminder.create({
    data: {
      schoolId,
      studentId,
      channel: "whatsapp",
      trigger: "manual",
      status: result.ok ? "sent" : "failed",
      message,
    },
  });

  revalidatePath(`/eleves/${studentId}`);
  return { ok: result.ok };
}

export async function bulkSendReminderAction(studentIds: string[]) {
  const { schoolId } = await verifySession();
  const students = (await prisma.student.findMany({
    where: { id: { in: studentIds }, schoolId },
    include: studentQueryInclude,
  })) as StudentWithPayments[];

  let sent = 0;
  for (const student of students) {
    if (!student.parentPhone) continue;
    const message = await buildReminderMessage(student);
    const result = await sendWhatsAppMessage(student.parentPhone, message);
    await prisma.reminder.create({
      data: {
        schoolId,
        studentId: student.id,
        channel: "whatsapp",
        trigger: "manual",
        status: result.ok ? "sent" : "failed",
        message,
      },
    });
    if (result.ok) sent += 1;
  }

  revalidatePath("/eleves");
  revalidatePath("/retards");
  return { sent, total: students.length };
}

export async function bulkChangeClassAction(studentIds: string[], newClassId: string) {
  const { schoolId } = await verifySession();
  const clazz = await prisma.schoolClass.findFirst({ where: { id: newClassId, schoolId } });
  if (!clazz) return { error: "Classe introuvable." };

  await prisma.student.updateMany({
    where: { id: { in: studentIds }, schoolId },
    data: { classId: newClassId },
  });

  revalidatePath("/eleves");
  return { ok: true };
}

export async function importStudentsCsvAction(
  classId: string,
  _prevState: StudentActionState,
  formData: FormData
): Promise<StudentActionState> {
  const { schoolId } = await verifySession();
  const clazz = await prisma.schoolClass.findFirst({ where: { id: classId, schoolId } });
  if (!clazz) return { error: "Classe introuvable." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Sélectionnez un fichier CSV." };

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { error: "Fichier vide. Format attendu : Matricule,Nom,Prenom,DateNaissance,NumeroParent" };

  const existingMatricules = (await prisma.student.findMany({ where: { schoolId }, select: { matricule: true } })).map(
    (s) => s.matricule
  );
  let counter = existingMatricules.length
    ? Math.max(...existingMatricules.map((m) => Number(m.replace(/[^\d]/g, "")) || 450))
    : 450;

  const dataRows = lines.slice(1);
  let imported = 0;
  const errors: string[] = [];

  for (const [i, line] of dataRows.entries()) {
    const cols = line.split(",").map((c) => c.trim());
    const [matriculeRaw, lastName, firstName, birthDateRaw, parentPhoneRaw] = cols;
    if (!lastName || !firstName) {
      errors.push(`Ligne ${i + 2} : nom/prénom manquant.`);
      continue;
    }
    counter += 1;
    const matricule = matriculeRaw || `BG-${counter}`;
    const birthDate = birthDateRaw ? new Date(birthDateRaw) : null;

    await prisma.student.create({
      data: {
        schoolId,
        classId,
        matricule,
        lastName: lastName.toUpperCase(),
        firstName,
        birthDate: birthDate && !Number.isNaN(birthDate.getTime()) ? birthDate : null,
        parentPhone: parentPhoneRaw ? normalizePhone(parentPhoneRaw) : null,
        whatsappStatus: parentPhoneRaw ? "reachable" : "unknown",
      },
    });
    imported += 1;
  }

  revalidatePath("/eleves");
  if (errors.length) {
    return { error: `${imported} élève(s) importé(s). ${errors.length} ligne(s) ignorée(s) : ${errors.slice(0, 3).join(" ")}` };
  }

  redirect(`/classes/${classId}/eleves`);
}
