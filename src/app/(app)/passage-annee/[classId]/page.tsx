import { notFound } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { computeStudentSummary, studentQueryInclude, type StudentWithPayments } from "@/lib/tuition";
import { guessNextClassName } from "@/lib/promotion";
import { PromotionScreen } from "./promotion-screen";

export default async function ClassPromotionPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const { schoolId } = await verifySession();

  const clazz = await prisma.schoolClass.findFirst({ where: { id: classId, schoolId, archived: false } });
  if (!clazz) notFound();

  const students = (await prisma.student.findMany({
    where: { classId, schoolId, status: "active" },
    include: studentQueryInclude,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })) as StudentWithPayments[];

  const rows = students.map((s) => ({
    id: s.id,
    matricule: s.matricule,
    lastName: s.lastName,
    firstName: s.firstName,
    summary: computeStudentSummary(s),
  }));

  return (
    <PromotionScreen
      classId={clazz.id}
      className={clazz.name}
      level={clazz.level}
      suggestedTarget={guessNextClassName(clazz.name)}
      students={rows.map((r) => ({
        id: r.id,
        matricule: r.matricule,
        lastName: r.lastName,
        firstName: r.firstName,
        statusLabel: r.summary.status === "solde" ? "Soldé" : r.summary.status === "non_defini" ? "—" : r.summary.statusLabel,
        statusTone: r.summary.status === "solde" ? "success" : r.summary.status === "retard" ? "danger" : "gold",
      }))}
    />
  );
}
