import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { verifySession, getCurrentSchool } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { computeStudentSummary, studentQueryInclude, type StudentWithPayments } from "@/lib/tuition";
import { buildReceiptPdf } from "@/lib/pdf/receipt-pdf";

const METHOD_LABEL: Record<string, string> = { cash: "Espèces", mobile_money: "Mobile Money", bank: "Virement bancaire" };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const { schoolId } = await verifySession();
  const school = await getCurrentSchool();

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, schoolId },
    include: { allocations: { include: { tranche: true } } },
  });
  if (!payment) return new Response("Reçu introuvable", { status: 404 });

  const student = (await prisma.student.findFirst({
    where: { id: payment.studentId },
    include: studentQueryInclude,
  })) as StudentWithPayments | null;
  if (!student) return new Response("Élève introuvable", { status: 404 });

  const summary = computeStudentSummary(student);
  const objet = payment.allocations.map((a) => a.tranche.label).join(", ") || "Paiement";

  const buffer = await renderToBuffer(
    buildReceiptPdf({
      schoolName: school.name,
      receiptNumber: payment.receiptNumber,
      date: payment.date,
      studentName: `${student.lastName} ${student.firstName}`,
      className: student.class.name,
      objet,
      method: METHOD_LABEL[payment.method] ?? payment.method,
      amount: payment.amount,
      remaining: summary.remaining,
      receivedBy: payment.receivedBy ?? school.contactName,
    })
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="recu-${String(payment.receiptNumber).padStart(4, "0")}.pdf"`,
    },
  });
}
