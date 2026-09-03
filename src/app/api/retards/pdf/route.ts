import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { verifySession, getCurrentSchool } from "@/lib/dal";
import { getLateStudents } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { buildLateListPdf } from "@/lib/pdf/late-list-pdf";

const WHATSAPP_LABEL: Record<string, string> = {
  reachable: "WhatsApp",
  unreachable: "À appeler",
  invalid: "N° invalide · à appeler",
  unknown: "À vérifier",
};

export async function GET(req: NextRequest) {
  await verifySession();
  const school = await getCurrentSchool();

  const classe = req.nextUrl.searchParams.get("classe") ?? undefined;
  const jours = req.nextUrl.searchParams.get("jours");
  const whatsapp = req.nextUrl.searchParams.get("whatsapp");
  const whatsappFilter = whatsapp === "injoignable" || whatsapp === "reachable" ? whatsapp : undefined;
  const ids = req.nextUrl.searchParams.get("ids")?.split(",").filter(Boolean);

  const data = await getLateStudents(school.id, {
    classId: classe,
    minDays: jours ? Number(jours) : undefined,
    whatsapp: whatsappFilter,
  });
  const filtered = ids ? data.rows.filter((r) => ids.includes(r.student.id)) : data.rows;

  const rows = filtered.map((r) => ({
    student: `${r.student.lastName} ${r.student.firstName}`,
    className: r.student.class.name,
    parentName: r.student.parentName ?? "—",
    parentPhone: r.student.parentPhone ?? "non renseigné",
    overdueLabel: r.summary.overdueTranches.map((t) => t.tranche.label).join(" + "),
    amount: r.summary.overdueAmount,
    whatsapp: WHATSAPP_LABEL[r.student.whatsappStatus] ?? r.student.whatsappStatus,
  }));

  const totalDue = rows.reduce((s, r) => s + r.amount, 0);
  const buffer = await renderToBuffer(buildLateListPdf({ rows, schoolName: school.name, totalDue }));

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="retards-${formatDate(new Date()).replace(/\//g, "-")}.pdf"`,
    },
  });
}
