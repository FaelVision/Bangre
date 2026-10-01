import { verifySession } from "@/lib/dal";
import { loadCanteenDataset } from "@/lib/canteen-core";
import { canteenEnrollCandidates, canteenOverview } from "@/lib/canteen-overview";
import { CanteenView } from "@/components/views/canteen-view";

export default async function CanteenPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; classe?: string; q?: string; page?: string }>;
}) {
  const { schoolId } = await verifySession();
  const { vue, classe, q, page } = await searchParams;
  const ds = await loadCanteenDataset(schoolId);

  return (
    <CanteenView
      data={canteenOverview(ds, { vue, classe, q, page: page ? Number(page) : 1 })}
      candidates={canteenEnrollCandidates(ds)}
    />
  );
}
