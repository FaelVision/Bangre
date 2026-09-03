"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession, getCurrentSchool } from "@/lib/dal";
import { computeTrancheStates, studentQueryInclude, type StudentWithPayments } from "@/lib/tuition";
import { persistPayment, type RecordPaymentInput } from "@/lib/payments-core";

export async function searchStudentsAction(query: string) {
  const { schoolId } = await verifySession();
  if (!query || query.trim().length < 1) return [];
  const students = await prisma.student.findMany({
    where: {
      schoolId,
      status: "active",
      OR: [
        { lastName: { contains: query } },
        { firstName: { contains: query } },
        { matricule: { contains: query } },
      ],
    },
    include: { class: true },
    take: 8,
  });
  return students.map((s) => ({
    id: s.id,
    label: `${s.lastName} ${s.firstName} · ${s.class.name} · ${s.matricule}`,
  }));
}

export async function getPaymentContextAction(studentId: string) {
  const { schoolId } = await verifySession();
  const school = await getCurrentSchool();
  const student = (await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    include: studentQueryInclude,
  })) as StudentWithPayments | null;

  if (!student) return { error: "Élève introuvable." } as const;

  const tuition = student.tuitionOverride ?? student.class.tuitionAmount;
  if (!tuition) {
    return { error: `La scolarité de la ${student.class.name} n'est pas encore configurée.` } as const;
  }

  const trancheStates = computeTrancheStates(student.class.tranches, student.payments);

  return {
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      matricule: student.matricule,
      className: student.class.name,
    },
    schoolName: school.name,
    receivedByDefault: school.contactName,
    nextReceiptNumber: school.receiptCounter + 1,
    tranches: trancheStates
      .filter((t) => t.remaining > 0)
      .map((t) => ({
        id: t.tranche.id,
        label: t.tranche.label,
        kind: t.tranche.kind,
        amount: t.tranche.amount,
        remaining: t.remaining,
        dueDate: t.tranche.dueDate.toISOString(),
        status: t.status,
        daysLate: t.daysLate,
      })),
  } as const;
}

export async function recordPaymentAction(input: RecordPaymentInput) {
  const { schoolId } = await verifySession();
  const result = await persistPayment(schoolId, input);
  if (result.ok) {
    revalidatePath("/tableau-de-bord");
    revalidatePath("/eleves");
    revalidatePath("/retards");
    revalidatePath("/paiements");
    revalidatePath(`/eleves/${input.studentId}`);
  }
  return result;
}
