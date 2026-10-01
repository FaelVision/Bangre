import { notFound } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { getStudentDetail } from "@/lib/queries";
import { StudentDetailView } from "@/components/views/student-detail-view";
import { loadCanteenDataset } from "@/lib/canteen-core";
import { canteenStudentCard } from "@/lib/canteen-overview";
import { loadUniformDataset } from "@/lib/uniforms-core";
import { uniformStudentCard } from "@/lib/uniforms-overview";

export default async function StudentDetailPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { schoolId } = await verifySession();
  const [data, canteen, daycare, uniforms] = await Promise.all([
    getStudentDetail(schoolId, studentId),
    loadCanteenDataset(schoolId, "canteen"),
    loadCanteenDataset(schoolId, "daycare"),
    loadUniformDataset(schoolId),
  ]);
  if (!data) notFound();

  return (
    <StudentDetailView
      data={data}
      canteen={canteenStudentCard(canteen, studentId)}
      daycare={canteenStudentCard(daycare, studentId)}
      uniforms={uniformStudentCard(uniforms, studentId)}
    />
  );
}
