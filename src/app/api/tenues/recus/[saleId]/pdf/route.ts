import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { verifySession, getCurrentSchool } from "@/lib/dal";
import { uniformReceipt } from "@/lib/uniforms-core";
import { describeLines } from "@/lib/uniforms";
import { buildReceiptPdf } from "@/lib/pdf/receipt-pdf";
import { formatMethod } from "@/lib/format";

/** A receipt for tenues: same layout as a tuition one, numbered in the same sequence. Paid in full. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ saleId: string }> }) {
  const { saleId } = await params;
  const { schoolId } = await verifySession();
  const school = await getCurrentSchool();

  const sale = await uniformReceipt(schoolId, saleId);
  if (!sale) return new Response("Reçu introuvable", { status: 404 });

  const buffer = await renderToBuffer(
    buildReceiptPdf({
      title: sale.cancelledAt ? "REÇU ANNULÉ · TENUES" : "REÇU DE PAIEMENT · TENUES",
      schoolName: school.name,
      receiptNumber: sale.receiptNumber,
      date: sale.date,
      studentName: `${sale.student.lastName} ${sale.student.firstName}`,
      className: sale.student.class.name,
      objet: sale.cancelledAt
        ? `ANNULÉ · ${describeLines(sale.lines)}${sale.cancelReason ? ` (${sale.cancelReason})` : ""}`
        : `Tenues · ${describeLines(sale.lines)}`,
      method: formatMethod(sale.method),
      amount: sale.amount,
      remaining: null,
      receivedBy: sale.receivedBy ?? school.contactName,
    })
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="recu-tenues-${String(sale.receiptNumber).padStart(4, "0")}.pdf"`,
    },
  });
}
