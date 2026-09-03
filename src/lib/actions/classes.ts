"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession, getCurrentAcademicYear } from "@/lib/dal";
import { parseDateInput } from "@/lib/date";

export type ClassActionState = { error?: string } | undefined;

function endOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
}

/** 1 October of the year an academic year (labelled "2026-2027") begins. */
function academicYearStart(label: string | undefined) {
  const startYear = Number(label?.match(/^(\d{4})/)?.[1]) || new Date().getUTCFullYear();
  return new Date(Date.UTC(startYear, 9, 1));
}

const LEVEL_ORDER: Record<string, number> = { Primaire: 0, Collège: 1, Lycée: 2 };

export async function createClassAction(
  _prevState: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const { schoolId } = await verifySession();
  const name = (formData.get("name") as string)?.trim();
  const level = formData.get("level") as string;

  if (!name || !level) {
    return { error: "Le nom et le niveau sont requis." };
  }

  const year = await getCurrentAcademicYear();
  if (!year) {
    return { error: "Aucune année scolaire active." };
  }

  const existing = await prisma.schoolClass.findFirst({
    where: { schoolId, academicYearId: year.id, name },
  });
  if (existing) {
    return { error: "Une classe porte déjà ce nom." };
  }

  const maxOrder = await prisma.schoolClass.aggregate({
    where: { schoolId, academicYearId: year.id },
    _max: { order: true },
  });

  const created = await prisma.schoolClass.create({
    data: {
      schoolId,
      academicYearId: year.id,
      name,
      level,
      order: (maxOrder._max.order ?? (LEVEL_ORDER[level] ?? 1) * 100) + 1,
      reminderMessageTemplate:
        "Bonjour {parent}, la {tranche} de la scolarité de {eleve} ({classe}), d'un montant de {montant} CFA, est attendue le {echeance}. Merci. — {ecole}",
    },
  });

  redirect(`/classes/${created.id}/configuration`);
}

export async function saveClassConfigAction(
  classId: string,
  _prevState: ClassActionState,
  formData: FormData
): Promise<ClassActionState> {
  const { schoolId } = await verifySession();
  const clazz = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId },
    include: { academicYear: { select: { label: true } } },
  });
  if (!clazz) return { error: "Classe introuvable." };

  const name = (formData.get("name") as string)?.trim() || clazz.name;
  const level = (formData.get("level") as string) || clazz.level;

  if (!name) return { error: "Le nom de la classe est requis." };
  if (name !== clazz.name) {
    const clash = await prisma.schoolClass.findFirst({
      where: { schoolId, academicYearId: clazz.academicYearId, name, id: { not: classId } },
      select: { id: true },
    });
    if (clash) return { error: `Une autre classe porte déjà le nom « ${name} ».` };
  }

  const tuitionAmount = Number(formData.get("tuitionAmount") || 0);
  const registrationFee = Number(formData.get("registrationFee") || 0);
  const reminderEnabled = formData.get("reminderEnabled") === "on";
  const reminderBeforeDays = Number(formData.get("reminderBeforeDays") || 7);
  const reminderAfterDays = (formData.get("reminderAfterDays") as string) || "3,10";
  const reminderHour = (formData.get("reminderHour") as string) || "08:00";
  const reminderMessageTemplate = (formData.get("reminderMessageTemplate") as string) || "";

  const labels = formData.getAll("tranche_label") as string[];
  const amounts = formData.getAll("tranche_amount") as string[];
  const dueTypes = formData.getAll("tranche_dueType") as string[];
  const dueDates = formData.getAll("tranche_dueDate") as string[];
  const ids = formData.getAll("tranche_id") as string[];

  const trancheInputs = labels.map((label, i) => ({
    id: ids[i] || null,
    label,
    amount: Math.round(Number(amounts[i] || 0)),
    dueType: dueTypes[i] || "date",
    dueDate: parseDateInput(dueDates[i]) ?? endOfCurrentMonth(),
  }));

  if (trancheInputs.some((t, i) => t.dueType === "date" && !parseDateInput(dueDates[i]))) {
    return { error: "Chaque tranche à date précise doit avoir une date valide (jj/mm/aaaa)." };
  }

  if (tuitionAmount > 0) {
    if (trancheInputs.length === 0) {
      return { error: "Ajoutez au moins une tranche de paiement pour un montant de scolarité défini." };
    }
    const trancheSum = trancheInputs.reduce((s, t) => s + t.amount, 0);
    if (trancheSum !== tuitionAmount) {
      return { error: `La somme des tranches (${trancheSum}) doit correspondre au montant total (${tuitionAmount}).` };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.schoolClass.update({
      where: { id: classId },
      data: {
        name,
        level,
        tuitionAmount: tuitionAmount || null,
        registrationFee: registrationFee || null,
        reminderEnabled,
        reminderBeforeDays,
        reminderAfterDays,
        reminderHour,
        reminderMessageTemplate,
      },
    });

    const existingTranches = await tx.tranche.findMany({ where: { classId } });
    const existingRegistration = existingTranches.find((t) => t.kind === "registration");
    const tuitionIds = new Set(existingTranches.filter((t) => t.kind !== "registration").map((t) => t.id));

    // Enrolment fee: keep its tranche in step with the number in the form.
    if (registrationFee > 0) {
      const data = {
        label: "Frais d'inscription",
        amount: Math.round(registrationFee),
        dueType: "date",
        dueDate: academicYearStart(clazz.academicYear?.label),
        order: 0,
      };
      if (existingRegistration) {
        await tx.tranche.update({ where: { id: existingRegistration.id }, data });
      } else {
        await tx.tranche.create({ data: { ...data, classId, kind: "registration" } });
      }
    }

    const keepIds = new Set(trancheInputs.map((t) => t.id).filter((id) => id && tuitionIds.has(id)) as string[]);
    const toDelete = [...tuitionIds].filter((id) => !keepIds.has(id));
    if (registrationFee <= 0 && existingRegistration) toDelete.push(existingRegistration.id);
    if (toDelete.length) {
      await tx.paymentAllocation.deleteMany({ where: { trancheId: { in: toDelete } } });
      await tx.tranche.deleteMany({ where: { id: { in: toDelete } } });
    }

    for (let i = 0; i < trancheInputs.length; i++) {
      const t = trancheInputs[i];
      if (t.id && tuitionIds.has(t.id)) {
        await tx.tranche.update({
          where: { id: t.id },
          data: { label: t.label, amount: t.amount, dueType: t.dueType, dueDate: t.dueDate, order: i + 1 },
        });
      } else {
        await tx.tranche.create({
          data: { classId, kind: "tuition", label: t.label, amount: t.amount, dueType: t.dueType, dueDate: t.dueDate, order: i + 1 },
        });
      }
    }
  });

  redirect("/classes");
}

export async function deleteClassAction(classId: string) {
  const { schoolId } = await verifySession();
  const clazz = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId },
    select: { id: true, _count: { select: { students: true } } },
  });
  if (!clazz) return { error: "Classe introuvable." };
  if (clazz._count.students > 0) {
    return {
      error: `Cette classe contient ${clazz._count.students} élève(s). Déplacez-les vers une autre classe avant de la supprimer.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    const tranches = await tx.tranche.findMany({ where: { classId }, select: { id: true } });
    if (tranches.length) {
      await tx.paymentAllocation.deleteMany({ where: { trancheId: { in: tranches.map((t) => t.id) } } });
      await tx.tranche.deleteMany({ where: { classId } });
    }
    await tx.schoolClass.delete({ where: { id: classId } });
  });

  revalidatePath("/classes");
  redirect("/classes");
}
