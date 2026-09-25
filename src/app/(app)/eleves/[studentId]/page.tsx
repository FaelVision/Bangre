import { notFound } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { getStudentDetail } from "@/lib/queries";
import { StudentDetailView } from "@/components/views/student-detail-view";

export default async function StudentDetailPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { schoolId } = await verifySession();
  const data = await getStudentDetail(schoolId, studentId);
  if (!data) notFound();

  return <StudentDetailView data={data} />;
}
