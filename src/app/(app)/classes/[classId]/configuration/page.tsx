import { notFound } from "next/navigation";
import { verifySession, getCurrentAcademicYear } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { ConfigForm } from "./config-form";

export default async function ClassConfigPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const { schoolId } = await verifySession();
  const [clazz, year] = await Promise.all([
    prisma.schoolClass.findFirst({
      where: { id: classId, schoolId },
      include: { tranches: { orderBy: { order: "asc" } }, students: { select: { id: true } } },
    }),
    getCurrentAcademicYear(),
  ]);

  if (!clazz) notFound();

  return <ConfigForm clazz={clazz} yearLabel={year?.label ?? ""} studentCount={clazz.students.length} />;
}
