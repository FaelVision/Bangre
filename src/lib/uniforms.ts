import type { UniformItem, UniformSale, UniformSaleLine, UniformVariant } from "@prisma/client";
import { formatCFA, formatDate } from "@/lib/format";

/**
 * Les tenues: the school's catalogue and how a sale is priced and checked.
 * Pure — the server (`uniforms-core.ts`) and the device (offline, from its
 * local copy) apply the same rules, so a sale taken without a network is
 * priced the way the server will record it.
 */

export type UniformItemWithVariants = UniformItem & { variants: UniformVariant[] };
export type UniformSaleWithLines = UniformSale & { lines: UniformSaleLine[] };

/** The class levels a tenue can be reserved to. */
export const UNIFORM_LEVELS = ["Maternelle", "Primaire", "Collège", "Lycée"] as const;

export function itemLevels(item: Pick<UniformItem, "levels">) {
  return item.levels
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Whether a pupil of this class level may buy the tenue. No level set: every level. */
export function itemOffered(item: Pick<UniformItem, "levels" | "archived">, level: string | null | undefined) {
  if (item.archived) return false;
  const levels = itemLevels(item);
  return levels.length === 0 || (level != null && levels.includes(level));
}

/** "Tenue scolaire · 8 ans", or just the name for a tenue without sizes. */
export function variantLabel(item: Pick<UniformItem, "name">, variant: Pick<UniformVariant, "size">) {
  return variant.size ? `${item.name} · ${variant.size}` : item.name;
}

/** The sizes still sold, in the school's order. */
export function activeVariants(item: UniformItemWithVariants) {
  return item.variants.filter((v) => !v.archived).sort((a, b) => a.order - b.order);
}

/** "2 × Tenue scolaire · 8 ans, 1 × Tenue de sport · M" — what a receipt says was sold. */
export function describeLines(lines: Pick<UniformSaleLine, "label" | "quantity">[]) {
  return lines.map((l) => `${l.quantity} × ${l.label}`).join(", ");
}

// ---------------------------------------------------------------------------
// Pricing a sale
// ---------------------------------------------------------------------------

export type UniformCartLine = { variantId: string; quantity: number };

export type UniformQuote =
  | {
      ok: true;
      amount: number;
      lines: { itemId: string; variantId: string; label: string; quantity: number; unitPrice: number; amount: number }[];
    }
  | { ok: false; error: string };

/**
 * What a cart costs, checked against the catalogue: every tenue still sold,
 * offered to the pupil's level, and — when the school tracks its stock — in
 * stock. `ignoreStock` is for a sale made offline and replayed: it was paid
 * at the counter, so it is recorded even if another computer sold the last
 * piece meanwhile (the stock then shows below zero).
 */
export function quoteUniformSale(
  catalog: UniformItemWithVariants[],
  cart: UniformCartLine[],
  level: string | null | undefined,
  options: { ignoreStock?: boolean } = {}
): UniformQuote {
  const byVariant = new Map<string, { item: UniformItemWithVariants; variant: UniformVariant }>();
  for (const item of catalog) for (const variant of item.variants) byVariant.set(variant.id, { item, variant });

  // The same size chosen twice counts once, quantities added.
  const wanted = new Map<string, number>();
  for (const line of cart) {
    const quantity = Math.floor(Number(line.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    wanted.set(line.variantId, (wanted.get(line.variantId) ?? 0) + quantity);
  }
  if (wanted.size === 0) return { ok: false, error: "Choisissez au moins une tenue." };

  const lines: Extract<UniformQuote, { ok: true }>["lines"] = [];
  for (const [variantId, quantity] of wanted) {
    const found = byVariant.get(variantId);
    if (!found || found.variant.archived || found.item.archived) {
      return { ok: false, error: "Cette tenue n'est plus au catalogue : rouvrez la fenêtre de vente." };
    }
    const { item, variant } = found;
    const label = variantLabel(item, variant);
    if (!itemOffered(item, level)) {
      return { ok: false, error: `« ${item.name} » n'est pas proposée au niveau de cet élève.` };
    }
    if (quantity > 50) return { ok: false, error: `Quantité trop grande pour « ${label} ».` };
    if (item.trackStock && !options.ignoreStock && quantity > variant.stock) {
      return {
        ok: false,
        error: variant.stock <= 0 ? `« ${label} » est épuisée.` : `Il ne reste que ${variant.stock} « ${label} » en stock.`,
      };
    }
    lines.push({ itemId: item.id, variantId, label, quantity, unitPrice: variant.price, amount: variant.price * quantity });
  }
  const amount = lines.reduce((s, l) => s + l.amount, 0);
  if (amount <= 0) return { ok: false, error: "Montant invalide." };
  return { ok: true, amount, lines };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** The WhatsApp confirmation after a sale of tenues. */
export function uniformConfirmationMessage(input: {
  amount: number;
  lines: Pick<UniformSaleLine, "label" | "quantity">[];
  studentFirstName: string;
  studentLastName: string;
  className: string;
  date: Date;
  schoolName: string;
  receiptNumber: number | null;
  delivered: boolean;
}) {
  const receipt = input.receiptNumber ? `reçu N° ${input.receiptNumber}` : "reçu remis à l'école";
  const handOver = input.delivered ? "" : " Les tenues seront remises dès qu'elles sont disponibles.";
  return `Bonjour, nous confirmons la réception de ${formatCFA(input.amount)} pour les tenues de ${input.studentFirstName} ${input.studentLastName} (${input.className}) le ${formatDate(input.date)} : ${describeLines(input.lines)}.${handOver} Merci. — ${input.schoolName}, ${receipt}`;
}
