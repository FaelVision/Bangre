import { notFound } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { getStudentDetail } from "@/lib/queries";
import { StudentDetailView } from "@/components/views/student-detail-view";
import { loadCanteenDataset } from "@/lib/canteen-core";
import { canteenStudentCard } from "@/lib/canteen-overview";

export default async function StudentDetailPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { schoolId } = await verifySession();
  const [data, canteen, daycare] = await Promise.all([
    getStudentDetail(schoolId, studentId),
    loadCanteenDataset(schoolId, "canteen"),
    loadCanteenDataset(schoolId, "daycare"),
  ]);
  if (!data) notFound();

  return (
    <StudentDetailView
      data={data}
      canteen={canteenStudentCard(canteen, studentId)}
      daycare={canteenStudentCard(daycare, studentId)}
    />
  );
}
