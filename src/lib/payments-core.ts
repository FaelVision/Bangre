import "server-only";
import { prisma } from "@/lib/db";
import {
  computeStudentSummary,
  computeTrancheStates,
  studentQueryInclude,
  type StudentWithPayments,
} from "@/lib/tuition";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { formatCFA, formatDate } from "@/lib/format";

export type RecordPaymentInput = {
  studentId: string;
  mode: "tranches" | "partial";
  trancheIds: string[];
  amount: number;
  date: string;
  method: string;
  receivedBy: string;
  notifyWhatsapp: boolean;
  offlineCreated?: boolean;
};

export type RecordPaymentResult =
  | { ok: true; paymentId: string; receiptNumber: number; amount: number }
  | { ok: false; error: string };

export async function persistPayment(schoolId: string, input: RecordPaymentInput): Promise<RecordPaymentResult> {
  const student = (await prisma.student.findFirst({
    where: { id: input.studentId, schoolId },
    include: studentQueryInclude,
  })) as StudentWithPayments | null;

  if (!student) return { ok: false, error: "Élève introuvable." };
  if (!student.class.tuitionAmount && !student.tuitionOverride) {
    return { ok: false, error: "La scolarité de cette classe n'est pas configurée." };
  }

  const trancheStates = computeTrancheStates(student.class.tranches, student.payments);
  const unpaid = trancheStates.filter((t) => t.remaining > 0).sort((a, b) => a.tranche.order - b.tranche.order);

  const allocations: { trancheId: string; amount: number }[] = [];

  if (input.mode === "tranches") {
    const wanted = new Set(input.trancheIds);
    for (const t of unpaid) {
      if (wanted.has(t.tranche.id)) allocations.push({ trancheId: t.tranche.id, amount: t.remaining });
    }
    if (allocations.length === 0) return { ok: false, error: "Sélectionnez au moins une tranche." };
  } else {
    let budget = Math.round(input.amount);
    if (budget <= 0) return { ok: false, error: "Montant invalide." };
    for (const t of unpaid) {
      if (budget <= 0) break;
      const take = Math.min(budget, t.remaining);
      if (take > 0) {
        allocations.push({ trancheId: t.tranche.id, amount: take });
        budget -= take;
      }
    }
    if (allocations.length === 0) return { ok: false, error: "Toutes les tranches sont déjà payées." };
  }

  const amount = allocations.reduce((s, a) => s + a.amount, 0);
  if (amount <= 0) return { ok: false, error: "Montant invalide." };

  const date = input.date ? new Date(input.date) : new Date();

  const result = await prisma.$transaction(async (tx) => {
    const school = await tx.school.update({
      where: { id: schoolId },
      data: { receiptCounter: { increment: 1 } },
    });
    const payment = await tx.payment.create({
      data: {
        schoolId,
        studentId: student.id,
        amount,
        method: input.method || "cash",
        receivedBy: input.receivedBy || undefined,
        date,
        receiptNumber: school.receiptCounter,
        offlineCreated: Boolean(input.offlineCreated),
        synced: true,
        whatsappNotified: false,
        allocations: { create: allocations },
      },
    });
    return { paymentId: payment.id, receiptNumber: payment.receiptNumber };
  });

  if (input.notifyWhatsapp && student.parentPhone) {
    // Recompute from the freshly persisted payments so "reste à payer" is exact:
    // it must account for the enrolment fee and every tranche, not just the base
    // tuition amount.
    const refreshed = (await prisma.student.findUnique({
      where: { id: student.id },
      include: studentQueryInclude,
    })) as StudentWithPayments | null;
    const remainingAfter = refreshed
      ? computeStudentSummary(refreshed).remaining
      : Math.max(0, student.class.tuitionAmount ?? 0);
    const message = `Bonjour, nous confirmons la réception de ${formatCFA(amount)} pour la scolarité de ${student.firstName} ${student.lastName} (${student.class.name}) le ${formatDate(date)}. Reste à payer : ${formatCFA(remainingAfter)}. Merci. — Reçu N° ${result.receiptNumber}`;
    await sendWhatsAppMessage(student.parentPhone, message);
    await prisma.payment.update({ where: { id: result.paymentId }, data: { whatsappNotified: true } });
  }

  return { ok: true, paymentId: result.paymentId, receiptNumber: result.receiptNumber, amount };
}
