import { notFound } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { EditStudentForm } from "./edit-student-form";

export default async function EditStudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { schoolId } = await verifySession();
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) notFound();

  return <EditStudentForm student={student} />;
}
