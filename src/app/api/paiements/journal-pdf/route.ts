import { renderToBuffer } from "@react-pdf/renderer";
import { verifySession, getCurrentSchool } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { buildJournalPdf } from "@/lib/pdf/journal-pdf";

const METHOD_LABEL: Record<string, string> = { cash: "Espèces", mobile_money: "Mobile Money", bank: "Virement" };

export async function GET() {
  const { schoolId } = await verifySession();
  const school = await getCurrentSchool();

  const payments = await prisma.payment.findMany({
    where: { schoolId },
    include: { student: { include: { class: true } }, allocations: { include: { tranche: true } } },
    orderBy: { date: "desc" },
    take: 500,
  });

  const rows = payments.map((p) => ({
    receipt: `N° ${String(p.receiptNumber).padStart(4, "0")}`,
    date: formatDate(p.date),
    student: `${p.student.lastName} ${p.student.firstName}`,
    className: p.student.class.name,
    objet: p.allocations.map((a) => a.tranche.label).join(", ") || "—",
    method: METHOD_LABEL[p.method] ?? p.method,
    amount: p.amount,
  }));

  const buffer = await renderToBuffer(buildJournalPdf({ rows, schoolName: school.name }));

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="journal-caisse-${formatDate(new Date()).replace(/\//g, "-")}.pdf"`,
    },
  });
}
