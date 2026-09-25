import { verifySession } from "@/lib/dal";
import { getClassesOverview } from "@/lib/queries";
import { ClassesView } from "@/components/views/classes-view";

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; niveau?: string }>;
}) {
  const { schoolId } = await verifySession();
  const { q, niveau } = await searchParams;
  const overview = await getClassesOverview(schoolId);

  return <ClassesView overview={overview} q={q} niveau={niveau} />;
}
