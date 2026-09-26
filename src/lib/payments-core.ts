import "server-only";
import { prisma } from "@/lib/db";
import {
  allocatePayment,
  computeStudentSummary,
  computeTrancheStates,
  studentQueryInclude,
  type StudentWithPayments,
} from "@/lib/tuition";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { paymentConfirmationMessage } from "@/lib/payment-message";

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
  /**
   * Identifies a payment replayed from a device outbox. Kept in the payment's
   * (otherwise unused) `note`, so a second copy of the same entry — its first
   * answer lost on a weak connection — returns the payment already recorded
   * instead of charging the family twice.
   */
  clientRef?: string;
};

export type RecordPaymentResult =
  | { ok: true; paymentId: string; receiptNumber: number; amount: number; whatsappUrl: string | null }
  | { ok: false; error: string };

export async function persistPayment(schoolId: string, input: RecordPaymentInput): Promise<RecordPaymentResult> {
  const student = (await prisma.student.findFirst({
    where: { id: input.studentId, schoolId },
    include: studentQueryInclude,
  })) as StudentWithPayments | null;

  if (!student) return { ok: false, error: "Élève introuvable." };

  if (input.clientRef) {
    const already = await prisma.payment.findFirst({
      where: { schoolId, note: input.clientRef },
      select: { id: true, receiptNumber: true, amount: true },
    });
    if (already) {
      return { ok: true, paymentId: already.id, receiptNumber: already.receiptNumber, amount: already.amount, whatsappUrl: null };
    }
  }

  if (!student.class.tuitionAmount && !student.tuitionOverride) {
    return { ok: false, error: "La scolarité de cette classe n'est pas configurée." };
  }

  const trancheStates = computeTrancheStates(student.class.tranches, student.payments);
  const allocated = allocatePayment(trancheStates, input);
  if (!allocated.ok) return { ok: false, error: allocated.error };
  const { allocations, amount } = allocated;

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
        note: input.clientRef ?? null,
        offlineCreated: Boolean(input.offlineCreated),
        synced: true,
        whatsappNotified: false,
        allocations: { create: allocations },
      },
    });
    return { paymentId: payment.id, receiptNumber: payment.receiptNumber, schoolName: school.name };
  });

  let whatsappUrl: string | null = null;
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
    const message = paymentConfirmationMessage({
      amount,
      studentFirstName: student.firstName,
      studentLastName: student.lastName,
      className: student.class.name,
      date,
      remainingAfter,
      schoolName: result.schoolName,
      receiptNumber: result.receiptNumber,
    });
    whatsappUrl = buildWhatsAppLink(student.parentPhone, message);
    await prisma.payment.update({ where: { id: result.paymentId }, data: { whatsappNotified: true } });
  }

  return { ok: true, paymentId: result.paymentId, receiptNumber: result.receiptNumber, amount, whatsappUrl };
}
