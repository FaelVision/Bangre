import { verifySession, getCurrentAcademicYear } from "@/lib/dal";
import { getDashboardData } from "@/lib/queries";
import { DashboardView } from "@/components/views/dashboard-view";

export default async function DashboardPage() {
  const { schoolId } = await verifySession();
  const [data, year] = await Promise.all([getDashboardData(schoolId), getCurrentAcademicYear()]);

  return <DashboardView data={data} yearLabel={year?.label ?? ""} />;
}
