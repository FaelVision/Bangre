import { verifySession } from "@/lib/dal";
import { getPaymentsOverview } from "@/lib/queries";
import { PaymentsView } from "@/components/views/payments-view";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { schoolId } = await verifySession();
  const { page } = await searchParams;
  const data = await getPaymentsOverview(schoolId, page ? Number(page) : 1);

  return <PaymentsView data={data} />;
}
