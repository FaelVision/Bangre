"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifySession, getCurrentAcademicYear } from "@/lib/dal";

export type ClassActionState = { error?: string } | undefined;

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
      order: (maxOrder._max.order ?? LEVEL_ORDER[level] * 100) + 1,
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
  const clazz = await prisma.schoolClass.findFirst({ where: { id: classId, schoolId } });
  if (!clazz) return { error: "Classe introuvable." };

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
    dueDate: new Date(dueDates[i]),
  }));

  if (tuitionAmount > 0) {
    const trancheSum = trancheInputs.reduce((s, t) => s + t.amount, 0);
    if (trancheInputs.length > 0 && trancheSum !== tuitionAmount) {
      return { error: `La somme des tranches (${trancheSum}) doit correspondre au montant total (${tuitionAmount}).` };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.schoolClass.update({
      where: { id: classId },
      data: {
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
    const keepIds = new Set(trancheInputs.map((t) => t.id).filter(Boolean) as string[]);
    const toDelete = existingTranches.filter((t) => !keepIds.has(t.id));
    if (toDelete.length) {
      await tx.paymentAllocation.deleteMany({ where: { trancheId: { in: toDelete.map((t) => t.id) } } });
      await tx.tranche.deleteMany({ where: { id: { in: toDelete.map((t) => t.id) } } });
    }

    for (let i = 0; i < trancheInputs.length; i++) {
      const t = trancheInputs[i];
      if (t.id) {
        await tx.tranche.update({
          where: { id: t.id },
          data: { label: t.label, amount: t.amount, dueType: t.dueType, dueDate: t.dueDate, order: i + 1 },
        });
      } else {
        await tx.tranche.create({
          data: { classId, label: t.label, amount: t.amount, dueType: t.dueType, dueDate: t.dueDate, order: i + 1 },
        });
      }
    }
  });

  redirect("/classes");
}
