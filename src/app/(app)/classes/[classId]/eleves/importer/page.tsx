import { notFound } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { ImportForm } from "./import-form";

export default async function ImportStudentsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const { schoolId } = await verifySession();
  const clazz = await prisma.schoolClass.findFirst({ where: { id: classId, schoolId } });
  if (!clazz) notFound();

  return <ImportForm classId={classId} className={clazz.name} />;
}
