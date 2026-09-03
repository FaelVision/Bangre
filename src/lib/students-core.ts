import "server-only";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/validation";
import { parseDateInput } from "@/lib/date";
import { nextMatricule, normalizeMatricule } from "@/lib/matricule";

/**
 * Student writes, shared by the server actions (online) and the sync endpoint
 * (replaying what was captured offline) so both paths apply exactly the same
 * validation and the same matricule rules.
 */

export type StudentInput = {
  classId: string;
  matricule?: string;
  lastName: string;
  firstName: string;
  birthDate?: string;
  gender?: string;
  parentName?: string;
  parentPhone?: string;
  whatsappStatus?: string;
};

export type StudentResult = { ok: true; studentId: string; matricule: string } | { ok: false; error: string };

export async function schoolMatricules(schoolId: string) {
  return (await prisma.student.findMany({ where: { schoolId }, select: { matricule: true } })).map((s) => s.matricule);
}

export async function createStudent(schoolId: string, input: StudentInput): Promise<StudentResult> {
  const lastName = input.lastName?.trim().toUpperCase();
  const firstName = input.firstName?.trim();

  if (!input.classId || !lastName || !firstName) {
    return { ok: false, error: "Nom, prénom et classe sont requis." };
  }

  const clazz = await prisma.schoolClass.findFirst({ where: { id: input.classId, schoolId } });
  if (!clazz) return { ok: false, error: "Classe introuvable." };

  const existing = await schoolMatricules(schoolId);
  const wanted = normalizeMatricule(input.matricule ?? "");
  const matricule = wanted || nextMatricule(existing);

  if (existing.some((m) => normalizeMatricule(m) === matricule)) {
    return { ok: false, error: `Le matricule ${matricule} est déjà utilisé par un autre élève.` };
  }

  const phone = input.parentPhone?.trim();
  const student = await prisma.student.create({
    data: {
      schoolId,
      classId: input.classId,
      matricule,
      lastName,
      firstName,
      birthDate: parseDateInput(input.birthDate),
      gender: input.gender || null,
      parentName: input.parentName?.trim() || null,
      parentPhone: phone ? normalizePhone(phone) : null,
      whatsappStatus: phone ? "reachable" : "unknown",
    },
  });

  return { ok: true, studentId: student.id, matricule: student.matricule };
}

export async function updateStudent(
  schoolId: string,
  studentId: string,
  input: StudentInput
): Promise<StudentResult> {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) return { ok: false, error: "Élève introuvable." };

  const lastName = input.lastName?.trim().toUpperCase();
  const firstName = input.firstName?.trim();
  if (!lastName || !firstName) return { ok: false, error: "Nom et prénom sont requis." };

  const matricule = normalizeMatricule(input.matricule ?? "") || student.matricule;
  if (matricule !== student.matricule) {
    const clash = await prisma.student.findFirst({
      where: { schoolId, matricule, id: { not: studentId } },
      select: { id: true },
    });
    if (clash) return { ok: false, error: `Le matricule ${matricule} est déjà utilisé par un autre élève.` };
  }

  const phone = input.parentPhone?.trim();
  await prisma.student.update({
    where: { id: studentId },
    data: {
      matricule,
      lastName,
      firstName,
      birthDate: parseDateInput(input.birthDate),
      gender: input.gender || null,
      parentName: input.parentName?.trim() || null,
      parentPhone: phone ? normalizePhone(phone) : null,
      // Keep the operator's existing assessment when the form doesn't carry one,
      // rather than silently downgrading a "reachable" parent to "unknown".
      whatsappStatus: input.whatsappStatus || student.whatsappStatus || "unknown",
    },
  });

  return { ok: true, studentId, matricule };
}
