"use client";

import { computeStudentSummary, computeTrancheStates } from "@/lib/tuition";
import { paymentConfirmationMessage } from "@/lib/payment-message";
import { buildWhatsAppLink } from "@/lib/whatsapp-link";
import { findStudentWithPayments } from "@/lib/offline-data";
import { loadLocalData } from "@/lib/offline-mirror";
import { searchStudents } from "@/lib/offline-queries";

/**
 * What the payment modal needs about a student. The server action builds it
 * from the database; these helpers build the identical object from the copy on
 * the device, so encaisser works the same way with no network — full tranche
 * breakdown included, for any student, not only the ones already opened.
 */

export type TrancheOption = {
  id: string;
  label: string;
  kind: string;
  amount: number;
  remaining: number;
  dueDate: string;
  status: "paid" | "partial" | "late" | "pending";
  daysLate: number;
};

export type PaymentContext = {
  student: { id: string; firstName: string; lastName: string; matricule: string; className: string };
  schoolName: string;
  receivedByDefault: string;
  nextReceiptNumber: number;
  tranches: TrancheOption[];
};

export async function localPaymentContext(studentId: string): Promise<PaymentContext | { error: string } | null> {
  const data = await loadLocalData();
  if (!data) return null;

  const student = findStudentWithPayments(data, studentId);
  if (!student) return null;

  const tuition = student.tuitionOverride ?? student.class.tuitionAmount;
  if (!tuition) return { error: `La scolarité de la ${student.class.name} n'est pas encore configurée.` };

  const trancheStates = computeTrancheStates(student.class.tranches, student.payments);

  return {
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      matricule: student.matricule,
      className: student.class.name,
    },
    schoolName: data.school.name,
    receivedByDefault: data.school.contactName,
    // Indicative only: the server assigns the real receipt number when the
    // payment reaches it, and payments queued on this device shift it further.
    nextReceiptNumber: data.school.receiptCounter + 1,
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
  };
}

export async function localStudentSearch(query: string) {
  const data = await loadLocalData();
  if (!data) return [];
  return searchStudents(data, query);
}

/**
 * The parent confirmation for a payment just queued on the device. The local
 * copy already includes that payment (the outbox is folded in), so "reste à
 * payer" is the amount after it — the same figure the server would write.
 */
export async function localPaymentConfirmationLink(
  studentId: string,
  amount: number,
  date: string
): Promise<string | null> {
  const data = await loadLocalData();
  if (!data) return null;
  const student = findStudentWithPayments(data, studentId);
  if (!student?.parentPhone) return null;

  const message = paymentConfirmationMessage({
    amount,
    studentFirstName: student.firstName,
    studentLastName: student.lastName,
    className: student.class.name,
    date: date ? new Date(date) : new Date(),
    remainingAfter: computeStudentSummary(student).remaining,
    schoolName: data.school.name,
    receiptNumber: null,
  });
  return buildWhatsAppLink(student.parentPhone, message);
}
