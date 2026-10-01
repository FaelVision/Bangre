import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { verifySession, getCurrentSchool } from "@/lib/dal";
import { canteenReceipt } from "@/lib/canteen-core";
import { buildReceiptPdf } from "@/lib/pdf/receipt-pdf";
import { formatMethod } from "@/lib/format";
import { serviceInfo } from "@/lib/services";

/**
 * A canteen or garde receipt: same layout as a tuition one, numbered in the
 * same sequence. The payment itself says which service it was for.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const { schoolId } = await verifySession();
  const school = await getCurrentSchool();

  const receipt = await canteenReceipt(schoolId, paymentId);
  if (!receipt) return new Response("Reçu introuvable", { status: 404 });
  const { payment, remaining } = receipt;
  const info = serviceInfo(receipt.service);

  const buffer = await renderToBuffer(
    buildReceiptPdf({
      title: payment.cancelledAt ? `REÇU ANNULÉ · ${info.receiptWord}` : `REÇU DE PAIEMENT · ${info.receiptWord}`,
      schoolName: school.name,
      receiptNumber: payment.receiptNumber,
      date: payment.date,
      studentName: `${payment.student.lastName} ${payment.student.firstName}`,
      className: payment.student.class.name,
      objet: payment.cancelledAt
        ? `ANNULÉ · ${payment.label}${payment.cancelReason ? ` (${payment.cancelReason})` : ""}`
        : `${info.title} · ${payment.label}`,
      method: formatMethod(payment.method),
      amount: payment.amount,
      remaining,
      remainingLabel: `Reste dû (${info.noun})`,
      receivedBy: payment.receivedBy ?? school.contactName,
    })
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="recu-${info.noun}-${String(payment.receiptNumber).padStart(4, "0")}.pdf"`,
    },
  });
}
