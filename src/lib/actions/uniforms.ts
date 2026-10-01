"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { UNIFORM_LEVELS } from "@/lib/uniforms";
import { uniformSaleContext } from "@/lib/uniforms-overview";
import {
  cancelUniformSale,
  loadUniformDataset,
  persistUniformSale,
  setUniformDelivered,
  type UniformSaleInput,
} from "@/lib/uniforms-core";

function revalidateUniforms(studentId?: string) {
  revalidatePath("/tenues");
  if (studentId) revalidatePath(`/eleves/${studentId}`);
}

export async function getUniformSaleContextAction(studentId: string) {
  const { schoolId } = await verifySession();
  return uniformSaleContext(await loadUniformDataset(schoolId), studentId);
}

export async function recordUniformSaleAction(input: UniformSaleInput) {
  const { schoolId } = await verifySession();
  const result = await persistUniformSale(schoolId, { ...input, offlineCreated: false });
  if (result.ok) revalidateUniforms(input.studentId);
  return result;
}

/** Marks tenues handed over to the family (or takes the mark off). */
export async function setUniformDeliveredAction(lineIds: string[], delivered: boolean) {
  const { schoolId } = await verifySession();
  const res = await setUniformDelivered(schoolId, lineIds, delivered);
  revalidatePath("/", "layout");
  return res;
}

/** Cancels a sale the day it was made; its pieces go back in stock. */
export async function cancelUniformSaleAction(saleId: string, reason?: string) {
  const { schoolId } = await verifySession();
  const res = await cancelUniformSale(schoolId, saleId, reason);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

/** Turns the tenues on or off. Returns whether the catalogue is still empty. */
export async function setUniformsEnabledAction(enabled: boolean) {
  const { schoolId } = await verifySession();
  await prisma.school.update({ where: { id: schoolId }, data: { uniformsEnabled: enabled } });
  revalidatePath("/", "layout");
  const needsCatalog = enabled && (await prisma.uniformItem.count({ where: { schoolId, archived: false } })) === 0;
  return { ok: true as const, needsCatalog };
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export type UniformCatalogState = { error?: string; saved?: boolean } | undefined;

type SizeInput = { id?: unknown; size?: unknown; price?: unknown; stock?: unknown; loadedStock?: unknown };
type ItemInput = { id?: unknown; name?: unknown; levels?: unknown; trackStock?: unknown; sizes?: unknown };

function whole(value: unknown) {
  const n = Number(String(value ?? "").replace(/[\s  .]/g, ""));
  return Number.isInteger(n) ? n : NaN;
}

/**
 * Saves the whole catalogue as the form shows it. A tenue or a size already
 * sold is archived rather than deleted, so its receipts keep their wording.
 * Stock is saved as a correction ("I now count 40"), applied on top of the
 * sales made since the form was opened.
 */
export async function saveUniformCatalogAction(
  _prev: UniformCatalogState,
  formData: FormData
): Promise<UniformCatalogState> {
  const { schoolId } = await verifySession();

  let raw: ItemInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("catalog") ?? "[]"));
    if (Array.isArray(parsed)) raw = parsed;
  } catch {
    return { error: "Catalogue illisible : rechargez la page." };
  }

  const items: {
    id: string | null;
    name: string;
    levels: string;
    trackStock: boolean;
    sizes: { id: string | null; size: string; price: number; stock: number; loadedStock: number | null }[];
  }[] = [];
  for (const item of raw) {
    const name = String(item.name ?? "").trim();
    const sizesRaw = Array.isArray(item.sizes) ? (item.sizes as SizeInput[]) : [];
    if (!name && sizesRaw.every((s) => !String(s.size ?? "").trim() && !s.price)) continue; // an empty row
    if (!name) return { error: "Chaque tenue a besoin d'un nom." };
    const levels = (Array.isArray(item.levels) ? item.levels : [])
      .map(String)
      .filter((l) => (UNIFORM_LEVELS as readonly string[]).includes(l));
    const trackStock = Boolean(item.trackStock);
    const sizes: (typeof items)[number]["sizes"] = [];
    const seen = new Set<string>();
    for (const s of sizesRaw) {
      const size = String(s.size ?? "").trim();
      const price = whole(s.price);
      const stock = trackStock ? whole(s.stock ?? 0) : 0;
      if (seen.has(size.toLowerCase())) {
        return { error: size ? `La taille « ${size} » apparaît deux fois pour « ${name} ».` : `« ${name} » a deux prix sans taille.` };
      }
      seen.add(size.toLowerCase());
      if (!Number.isInteger(price) || price <= 0) {
        return { error: `Indiquez le prix de « ${name}${size ? ` · ${size}` : ""} ».` };
      }
      if (trackStock && (!Number.isInteger(stock) || stock < 0)) {
        return { error: `Le stock de « ${name}${size ? ` · ${size}` : ""} » doit être un nombre positif.` };
      }
      const loaded = s.loadedStock == null || s.loadedStock === "" ? null : whole(s.loadedStock);
      sizes.push({
        id: typeof s.id === "string" && s.id ? s.id : null,
        size,
        price,
        stock,
        loadedStock: Number.isInteger(loaded) ? loaded : null,
      });
    }
    if (sizes.length === 0) return { error: `Indiquez au moins un prix pour « ${name} ».` };
    if (sizes.length > 1 && sizes.some((s) => !s.size)) {
      return { error: `« ${name} » : nommez chaque taille (ex. 6 ans, 8 ans, S, M…).` };
    }
    items.push({ id: typeof item.id === "string" && item.id ? item.id : null, name, levels: levels.join(","), trackStock, sizes });
  }

  const existing = await prisma.uniformItem.findMany({
    where: { schoolId },
    include: { variants: { include: { _count: { select: { saleLines: true } } } }, _count: { select: { saleLines: true } } },
  });
  const existingById = new Map(existing.map((i) => [i.id, i]));

  await prisma.$transaction(async (tx) => {
    const keptItems = new Set<string>();
    for (const [order, item] of items.entries()) {
      const current = item.id ? existingById.get(item.id) : undefined;
      const data = { name: item.name, levels: item.levels, trackStock: item.trackStock, order, archived: false };
      const saved = current
        ? await tx.uniformItem.update({ where: { id: current.id }, data })
        : await tx.uniformItem.create({ data: { schoolId, ...data } });
      keptItems.add(saved.id);

      const variantsById = new Map((current?.variants ?? []).map((v) => [v.id, v]));
      const keptVariants = new Set<string>();
      for (const [vOrder, size] of item.sizes.entries()) {
        const variant = size.id ? variantsById.get(size.id) : undefined;
        if (variant) {
          // Stock: the count typed, corrected by what sold since the form opened.
          const stock =
            item.trackStock && size.loadedStock != null ? variant.stock + (size.stock - size.loadedStock) : size.stock;
          await tx.uniformVariant.update({
            where: { id: variant.id },
            data: { size: size.size, price: size.price, stock, order: vOrder, archived: false },
          });
          keptVariants.add(variant.id);
        } else {
          const created = await tx.uniformVariant.create({
            data: { itemId: saved.id, size: size.size, price: size.price, stock: size.stock, order: vOrder },
          });
          keptVariants.add(created.id);
        }
      }
      for (const v of current?.variants ?? []) {
        if (keptVariants.has(v.id)) continue;
        if (v._count.saleLines > 0) await tx.uniformVariant.update({ where: { id: v.id }, data: { archived: true } });
        else await tx.uniformVariant.delete({ where: { id: v.id } });
      }
    }
    for (const item of existing) {
      if (keptItems.has(item.id)) continue;
      if (item._count.saleLines > 0) await tx.uniformItem.update({ where: { id: item.id }, data: { archived: true } });
      else await tx.uniformItem.delete({ where: { id: item.id } });
    }
    await tx.school.update({ where: { id: schoolId }, data: { uniformsEnabled: true } });
  });

  revalidatePath("/", "layout");
  return { saved: true };
}
