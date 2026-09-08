"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { previewReminder, previewReminders, recordReminderSent } from "@/lib/reminders-core";
import { normalizePhone } from "@/lib/validation";
import { parseDateInput } from "@/lib/date";
import { nextMatricule, normalizeMatricule } from "@/lib/matricule";
import {
  parseStudentsFile,
  parseStudentsRows,
  rowsFromColumns,
  columnsFromMapping,
  looksLikePhone,
  FIELD_LABELS,
  type ParsedImport,
  type StudentField,
} from "@/lib/student-import";
import { xlsxToRows } from "@/lib/xlsx";
import { createStudent, updateStudent, schoolMatricules, type StudentInput } from "@/lib/students-core";

export type StudentActionState = { error?: string } | undefined;

/** Suggested next matricule for the "add student" form (the user can change it). */
export async function suggestNextMatricule() {
  const { schoolId } = await verifySession();
  return nextMatricule(await schoolMatricules(schoolId));
}

function studentInputFrom(formData: FormData): StudentInput {
  return {
    classId: (formData.get("classId") as string) ?? "",
    matricule: (formData.get("matricule") as string) ?? "",
    lastName: (formData.get("lastName") as string) ?? "",
    firstName: (formData.get("firstName") as string) ?? "",
    birthDate: (formData.get("birthDate") as string) ?? "",
    gender: (formData.get("gender") as string) ?? "",
    parentName: (formData.get("parentName") as string) ?? "",
    parentPhone: (formData.get("parentPhone") as string) ?? "",
    whatsappStatus: (formData.get("whatsappStatus") as string) ?? "",
  };
}

export async function createStudentAction(
  _prevState: StudentActionState,
  formData: FormData
): Promise<StudentActionState> {
  const { schoolId } = await verifySession();
  const input = studentInputFrom(formData);

  const result = await createStudent(schoolId, input);
  if (!result.ok) return { error: result.error };

  revalidatePath("/eleves");
  redirect(`/classes/${input.classId}/eleves`);
}

export async function updateStudentAction(
  studentId: string,
  _prevState: StudentActionState,
  formData: FormData
): Promise<StudentActionState> {
  const { schoolId } = await verifySession();

  const result = await updateStudent(schoolId, studentId, studentInputFrom(formData));
  if (!result.ok) return { error: result.error };

  revalidatePath(`/eleves/${studentId}`);
  redirect(`/eleves/${studentId}`);
}

export async function deleteStudentAction(studentId: string) {
  const { schoolId } = await verifySession();
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: { id: true, classId: true, _count: { select: { payments: true } } },
  });
  if (!student) return { error: "Élève introuvable." };
  if (student._count.payments > 0) {
    return {
      error:
        "Impossible de supprimer : des paiements sont enregistrés pour cet élève. Marquez-le plutôt comme « sorti » via le passage d'année.",
    };
  }

  await prisma.student.delete({ where: { id: studentId } });

  revalidatePath("/eleves");
  revalidatePath(`/classes/${student.classId}/eleves`);
  redirect(`/classes/${student.classId}/eleves`);
}

export async function previewReminderAction(studentId: string) {
  const { schoolId } = await verifySession();
  const res = await previewReminder(schoolId, studentId);
  if (!res.ok) return { error: res.skipped };
  return res;
}

export async function bulkPreviewRemindersAction(studentIds: string[]) {
  const { schoolId } = await verifySession();
  return previewReminders(schoolId, studentIds);
}

export async function confirmReminderSentAction(studentId: string, trancheId: string | null, message: string) {
  const { schoolId } = await verifySession();
  const res = await recordReminderSent(schoolId, studentId, trancheId, message);
  revalidatePath(`/eleves/${studentId}`);
  revalidatePath("/eleves");
  revalidatePath("/retards");
  return res;
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

export type ImportActionState =
  | { error?: string; imported?: number; skipped?: string[] }
  | undefined;

const XLSX_ERROR =
  "Fichier Excel illisible. Enregistrez-le au format CSV (Fichier › Enregistrer sous › CSV) et réessayez.";
const NO_NAME_ERROR =
  "Aucune colonne de noms n'a été reconnue dans ce fichier. Vérifiez qu'il contient bien une colonne de noms (l'ordre des colonnes, lui, n'a pas d'importance).";

const VALID_FIELDS = new Set(Object.keys(FIELD_LABELS) as StudentField[]);

/** Read the uploaded file — real .xlsx or any delimited text — into a parse. */
async function readImport(file: File): Promise<ParsedImport | { error: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // A ZIP container (".xlsx") starts with "PK\x03\x04"; trust that over the name.
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

  if (isZip || /\.xlsx$/i.test(file.name)) {
    try {
      return parseStudentsRows(xlsxToRows(bytes));
    } catch {
      return { error: XLSX_ERROR };
    }
  }
  return parseStudentsFile(new TextDecoder().decode(bytes));
}

/**
 * The correspondence grid the user validated, if any: `{ [columnIndex]: field }`.
 * Untrusted — every key and value is checked before it is used.
 */
function readMapping(formData: FormData): Record<number, StudentField | ""> | null {
  const raw = formData.get("mapping");
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const mapping: Record<number, StudentField | ""> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0) continue;
    if (value === "" || (typeof value === "string" && VALID_FIELDS.has(value as StudentField))) {
      mapping[index] = value as StudentField | "";
    }
  }
  return Object.keys(mapping).length > 0 ? mapping : null;
}

/**
 * Import the list the school already keeps. The columns may come in any order,
 * under any of the usual headings — `student-import.ts` recognises them, and the
 * user can correct that mapping — so the only thing asked of the file is that
 * the information be in there.
 */
export async function importStudentsCsvAction(
  classId: string,
  _prevState: ImportActionState,
  formData: FormData
): Promise<ImportActionState> {
  const { schoolId } = await verifySession();
  const clazz = await prisma.schoolClass.findFirst({ where: { id: classId, schoolId } });
  if (!clazz) return { error: "Classe introuvable." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Sélectionnez un fichier." };

  const result = await readImport(file);
  if ("error" in result) return result;

  // The user's corrections in the correspondence grid win over auto-detection.
  const parsed = result;
  const mapping = readMapping(formData);
  const columns = mapping
    ? columnsFromMapping(mapping, parsed.headers)
    : parsed.columns;
  const rows = mapping ? rowsFromColumns(parsed.dataGrid, columns) : parsed.rows;

  if (!columns.some((c) => c.field === "lastName" || c.field === "fullName")) {
    return { error: NO_NAME_ERROR };
  }
  if (rows.length === 0) return { error: "Aucun élève n'a été trouvé dans ce fichier." };

  const used = new Set((await schoolMatricules(schoolId)).map((m) => normalizeMatricule(m)));
  const skipped: string[] = [];
  let imported = 0;

  for (const row of rows) {
    if (!row.lastName || !row.firstName) {
      skipped.push(`Ligne ${row.line} : nom ou prénom manquant.`);
      continue;
    }

    const wanted = normalizeMatricule(row.matricule);
    if (wanted && used.has(wanted)) {
      skipped.push(`Ligne ${row.line} : le matricule ${wanted} est déjà utilisé.`);
      continue;
    }
    const matricule = wanted || nextMatricule([...used]);
    used.add(normalizeMatricule(matricule));

    const phone = looksLikePhone(row.parentPhone) ? normalizePhone(row.parentPhone) : null;
    await prisma.student.create({
      data: {
        schoolId,
        classId,
        matricule,
        lastName: row.lastName.toUpperCase(),
        firstName: row.firstName,
        birthDate: parseDateInput(row.birthDate),
        gender: row.gender || null,
        parentName: row.parentName || null,
        parentPhone: phone,
        whatsappStatus: phone ? "reachable" : "unknown",
      },
    });
    imported += 1;
  }

  revalidatePath("/eleves");
  revalidatePath(`/classes/${classId}/eleves`);
  if (skipped.length) return { imported, skipped };

  redirect(`/classes/${classId}/eleves`);
}
