import { verifySession } from "@/lib/dal";
import { loadUniformDataset } from "@/lib/uniforms-core";
import { uniformsOverview } from "@/lib/uniforms-overview";
import { UniformsView } from "@/components/views/uniforms-view";

export default async function UniformsPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; q?: string; page?: string }>;
}) {
  const { schoolId } = await verifySession();
  const { vue, q, page } = await searchParams;
  const ds = await loadUniformDataset(schoolId);
  return <UniformsView data={uniformsOverview(ds, { vue, q, page: page ? Number(page) : 1 })} />;
}
