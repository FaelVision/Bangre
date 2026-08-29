import { NextRequest } from "next/server";
import { verifySession } from "@/lib/dal";
import { getLateStudents } from "@/lib/queries";
import { formatDate } from "@/lib/format";

function csvEscape(value: string) {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: NextRequest) {
  const { schoolId } = await verifySession();
  const classe = req.nextUrl.searchParams.get("classe") ?? undefined;
  const jours = req.nextUrl.searchParams.get("jours");

  const data = await getLateStudents(schoolId, { classId: classe, minDays: jours ? Number(jours) : undefined });

  const header = ["Matricule", "Nom", "Prenom", "Classe", "Parent", "Numero", "Tranches dues", "Montant du", "Statut WhatsApp"];
  const lines = [header.join(";")];

  for (const r of data.rows) {
    const overdueLabel = r.summary.overdueTranches.map((t) => t.tranche.label).join(" + ");
    lines.push(
      [
        r.student.matricule,
        r.student.lastName,
        r.student.firstName,
        r.student.class.name,
        r.student.parentName ?? "",
        r.student.parentPhone ?? "",
        overdueLabel,
        String(r.summary.overdueAmount),
        r.student.whatsappStatus,
      ]
        .map((v) => csvEscape(String(v)))
        .join(";")
    );
  }

  const csv = "﻿" + lines.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="retards-${formatDate(new Date()).replace(/\//g, "-")}.csv"`,
    },
  });
}
