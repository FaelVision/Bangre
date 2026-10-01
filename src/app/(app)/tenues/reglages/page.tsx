import { verifySession } from "@/lib/dal";
import { loadUniformCatalog } from "@/lib/uniforms-core";
import { activeVariants } from "@/lib/uniforms";
import { itemLevels } from "@/lib/uniforms";
import { UniformCatalogForm, type CatalogItemRow } from "@/components/uniforms/catalog-form";

export default async function UniformCatalogPage() {
  const { schoolId } = await verifySession();
  const catalog = await loadUniformCatalog(schoolId);

  const initial: CatalogItemRow[] = catalog
    .filter((item) => !item.archived)
    .map((item) => {
      const variants = activeVariants(item);
      const prices = new Set(variants.map((v) => v.price));
      const hasSizes = variants.length > 1 || (variants[0]?.size ?? "") !== "";
      return {
        id: item.id,
        name: item.name,
        levels: itemLevels(item),
        trackStock: item.trackStock,
        hasSizes,
        priceBySize: prices.size > 1,
        price: String(variants[0]?.price ?? ""),
        // `loadedStock`: the count shown, so a correction applies on top of
        // the sales made while the form is open.
        sizes: variants.map((v) => ({ id: v.id, size: v.size, price: String(v.price), stock: String(Math.max(0, v.stock)), loadedStock: Math.max(0, v.stock) })),
      };
    });

  return <UniformCatalogForm initial={initial} />;
}
