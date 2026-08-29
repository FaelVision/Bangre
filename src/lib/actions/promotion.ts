"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { nextAcademicYearLabel } from "@/lib/promotion";

export type Decision = "promote" | "repeat" | "transferred" | "left";

export async function getOrCreateNextAcademicYear(schoolId: string) {
  const current = await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
  if (!current) throw new Error("Aucune année scolaire active.");

  const label = nextAcademicYearLabel(current.label);
  let next = await prisma.academicYear.findFirst({ where: { schoolId, label } });
  if (!next) {
    next = await prisma.academicYear.create({ data: { schoolId, label, isCurrent: false } });
  }
  return next;
}

async function findOrCreateClassInYear(
  schoolId: string,
  academicYearId: string,
  name: string,
  level: string,
  order: number
) {
  const existing = await prisma.schoolClass.findFirst({ where: { schoolId, academicYearId, name } });
  if (existing) return existing;
  return prisma.schoolClass.create({
    data: {
      schoolId,
      academicYearId,
      name,
      level,
      order,
      reminderMessageTemplate:
        "Bonjour {parent}, la {tranche} de la scolarité de {eleve} ({classe}), d'un montant de {montant} CFA, est attendue le {echeance}. Merci. — {ecole}",
    },
  });
}

export async function validateClassPromotionAction(input: {
  sourceClassId: string;
  targetClassName: string;
  targetLevel: string;
  decisions: Record<string, Decision>;
}) {
  const { schoolId } = await verifySession();
  const sourceClass = await prisma.schoolClass.findFirst({ where: { id: input.sourceClassId, schoolId } });
  if (!sourceClass) return { error: "Classe introuvable." };

  const nextYear = await getOrCreateNextAcademicYear(schoolId);

  const [targetClass, repeatClass] = await Promise.all([
    findOrCreateClassInYear(schoolId, nextYear.id, input.targetClassName, input.targetLevel, sourceClass.order),
    findOrCreateClassInYear(schoolId, nextYear.id, sourceClass.name, sourceClass.level, sourceClass.order),
  ]);

  const entries = Object.entries(input.decisions);

  await prisma.$transaction(async (tx) => {
    for (const [studentId, decision] of entries) {
      if (decision === "promote") {
        await tx.student.update({ where: { id: studentId }, data: { classId: targetClass.id, status: "active" } });
        await tx.promotionDecision.create({
          data: { studentId, fromClassId: sourceClass.id, toClassId: targetClass.id, decision },
        });
      } else if (decision === "repeat") {
        await tx.student.update({ where: { id: studentId }, data: { classId: repeatClass.id, status: "active" } });
        await tx.promotionDecision.create({
          data: { studentId, fromClassId: sourceClass.id, toClassId: repeatClass.id, decision },
        });
      } else {
        await tx.student.update({ where: { id: studentId }, data: { status: decision } });
        await tx.promotionDecision.create({
          data: { studentId, fromClassId: sourceClass.id, toClassId: null, decision },
        });
      }
    }
    await tx.schoolClass.update({ where: { id: sourceClass.id }, data: { archived: true } });
  });

  revalidatePath("/passage-annee");
  revalidatePath("/classes");
  revalidatePath("/eleves");
  return { ok: true, nextYearLabel: nextYear.label };
}

export async function finalizeYearTransitionAction() {
  const { schoolId } = await verifySession();
  const current = await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
  if (!current) return { error: "Aucune année active." };

  const label = nextAcademicYearLabel(current.label);
  const next = await prisma.academicYear.findFirst({ where: { schoolId, label } });
  if (!next) return { error: "Aucune classe n'a encore été passée en année suivante." };

  await prisma.$transaction([
    prisma.academicYear.update({ where: { id: current.id }, data: { isCurrent: false } }),
    prisma.academicYear.update({ where: { id: next.id }, data: { isCurrent: true } }),
  ]);

  revalidatePath("/");
  return { ok: true };
}
