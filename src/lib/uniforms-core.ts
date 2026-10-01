import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { currentAcademicYear } from "@/lib/canteen-core";
import { undoableToday } from "@/lib/canteen-overview";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { quoteUniformSale, uniformConfirmationMessage, type UniformCartLine } from "@/lib/uniforms";
import { uniformsToDeliverCount, type UniformDataset } from "@/lib/uniforms-overview";

/**
 * Tenues against the database. Shared by the server actions (online) and by
 * `/api/sync` (sales replayed from a device outbox): the same checks either way.
 */

async function loadCatalog(schoolId: string) {
  return prisma.uniformItem.findMany({
    where: { schoolId },
    include: { variants: { orderBy: { order: "asc" } } },
    orderBy: { order: "asc" },
  });
}

/** Everything the Tenues screens compute from, for the current year. Read once per request. */
export const loadUniformDataset = cache(async (schoolId: string): Promise<UniformDataset> => {
  const [school, year] = await Promise.all([
    prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { name: true, contactName: true, receiptCounter: true, uniformsEnabled: true },
    }),
    currentAcademicYear(schoolId),
  ]);
  const base = {
    enabled: school.uniformsEnabled,
    schoolName: school.name,
    contactName: school.contactName,
    receiptCounter: school.receiptCounter,
    yearLabel: year?.label ?? "",
    online: true,
  };
  if (!school.uniformsEnabled) return { ...base, catalog: [], students: [], sales: [] };

  const [catalog, students, sales] = await Promise.all([
    loadCatalog(schoolId),
    prisma.student.findMany({ where: { schoolId }, include: { class: { select: { name: true, level: true } } } }),
    prisma.uniformSale.findMany({
      where: { schoolId, academicYearId: year?.id ?? "" },
      include: { lines: true },
      orderBy: { date: "desc" },
    }),
  ]);
  return { ...base, catalog, students, sales };
});

export async function uniformsToDeliverFor(schoolId: string) {
  return uniformsToDeliverCount(await loadUniformDataset(schoolId));
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export type UniformSaleInput = {
  studentId: string;
  cart: UniformCartLine[];
  date: string;
  method: string;
  receivedBy: string;
  notifyWhatsapp: boolean;
  /** The tenues were handed over at the counter. */
  delivered: boolean;
  offlineCreated?: boolean;
  /** Outbox id: a second copy of the same entry returns the sale already recorded. */
  clientRef?: string;
};

export type UniformSaleResult =
  | { ok: true; saleId: string; receiptNumber: number; amount: number; whatsappUrl: string | null }
  | { ok: false; error: string };

export async function persistUniformSale(schoolId: string, input: UniformSaleInput): Promise<UniformSaleResult> {
  if (input.clientRef) {
    const already = await prisma.uniformSale.findFirst({
      where: { schoolId, clientRef: input.clientRef },
      select: { id: true, receiptNumber: true, amount: true },
    });
    if (already) return { ok: true, saleId: already.id, receiptNumber: already.receiptNumber, amount: already.amount, whatsappUrl: null };
  }

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { uniformsEnabled: true } });
  if (!school?.uniformsEnabled) return { ok: false, error: "Les tenues ne sont pas activées pour cet établissement." };
  const year = await currentAcademicYear(schoolId);
  if (!year) return { ok: false, error: "Aucune année scolaire active." };

  const student = await prisma.student.findFirst({
    where: { id: input.studentId, schoolId },
    include: { class: { select: { name: true, level: true } } },
  });
  if (!student) return { ok: false, error: "Élève introuvable." };

  const date = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(date.getTime())) return { ok: false, error: "Date invalide." };
  const cart = Array.isArray(input.cart) ? input.cart : [];
  // A sale taken offline was paid at the counter: it is recorded even if the
  // last piece went elsewhere meanwhile.
  const ignoreStock = Boolean(input.offlineCreated);

  const result = await prisma.$transaction(async (tx) => {
    const catalog = await tx.uniformItem.findMany({ where: { schoolId }, include: { variants: true } });
    const quote = quoteUniformSale(catalog, cart, student.class.level, { ignoreStock });
    if (!quote.ok) return quote;

    const tracked = new Set(catalog.filter((i) => i.trackStock).map((i) => i.id));
    for (const line of quote.lines) {
      if (!tracked.has(line.itemId)) continue;
      // Two counters selling the last piece at once: only one goes through.
      const taken = await tx.uniformVariant.updateMany({
        where: { id: line.variantId, ...(ignoreStock ? {} : { stock: { gte: line.quantity } }) },
        data: { stock: { decrement: line.quantity } },
      });
      if (taken.count === 0) return { ok: false as const, error: `« ${line.label} » vient d'être épuisée.` };
    }

    const updated = await tx.school.update({ where: { id: schoolId }, data: { receiptCounter: { increment: 1 } } });
    const deliveredAt = input.delivered ? new Date() : null;
    const sale = await tx.uniformSale.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId: year.id,
        amount: quote.amount,
        method: input.method || "cash",
        receivedBy: input.receivedBy || undefined,
        date,
        receiptNumber: updated.receiptCounter,
        clientRef: input.clientRef ?? null,
        offlineCreated: Boolean(input.offlineCreated),
        synced: true,
        lines: { create: quote.lines.map((l) => ({ ...l, deliveredAt })) },
      },
    });
    return { ok: true as const, sale, lines: quote.lines, schoolName: updated.name };
  });
  if (!result.ok) return result;

  let whatsappUrl: string | null = null;
  if (input.notifyWhatsapp && student.parentPhone) {
    whatsappUrl = buildWhatsAppLink(
      student.parentPhone,
      uniformConfirmationMessage({
        amount: result.sale.amount,
        lines: result.lines,
        studentFirstName: student.firstName,
        studentLastName: student.lastName,
        className: student.class.name,
        date,
        schoolName: result.schoolName,
        receiptNumber: result.sale.receiptNumber,
        delivered: Boolean(input.delivered),
      })
    );
    await prisma.uniformSale.update({ where: { id: result.sale.id }, data: { whatsappNotified: true } });
  }
  return { ok: true, saleId: result.sale.id, receiptNumber: result.sale.receiptNumber, amount: result.sale.amount, whatsappUrl };
}

export type UniformWriteResult = { ok: true } | { ok: false; error: string };

/** Marks lines of a sale handed over (or not). Sets a state: a replayed entry changes nothing. */
export async function setUniformDelivered(
  schoolId: string,
  lineIds: string[],
  delivered: boolean
): Promise<UniformWriteResult> {
  const ids = (Array.isArray(lineIds) ? lineIds : []).map(String);
  if (ids.length === 0) return { ok: true };
  await prisma.uniformSaleLine.updateMany({
    where: { id: { in: ids }, sale: { schoolId }, deliveredAt: delivered ? null : { not: null } },
    data: { deliveredAt: delivered ? new Date() : null },
  });
  return { ok: true };
}

/**
 * Cancels a sale entered by mistake, the day it was made: kept in the journal
 * marked "Annulé", its receipt number not reused, its pieces back in stock.
 */
export async function cancelUniformSale(schoolId: string, saleId: string, reason?: string): Promise<UniformWriteResult> {
  const sale = await prisma.uniformSale.findFirst({
    where: { id: saleId, schoolId },
    include: { lines: { include: { item: { select: { trackStock: true } } } } },
  });
  if (!sale) return { ok: false, error: "Vente introuvable." };
  if (sale.cancelledAt) return { ok: true };
  if (!undoableToday(sale.createdAt)) return { ok: false, error: "Une vente ne peut être annulée que le jour même." };

  await prisma.$transaction(async (tx) => {
    for (const line of sale.lines) {
      if (!line.item.trackStock) continue;
      await tx.uniformVariant.update({ where: { id: line.variantId }, data: { stock: { increment: line.quantity } } });
    }
    await tx.uniformSale.update({
      where: { id: sale.id },
      data: { cancelledAt: new Date(), cancelReason: reason?.trim() || null },
    });
  });
  return { ok: true };
}

/** What a tenues receipt shows, or null when it is not this school's. */
export async function uniformReceipt(schoolId: string, saleId: string) {
  return prisma.uniformSale.findFirst({
    where: { id: saleId, schoolId },
    include: { lines: true, student: { include: { class: { select: { name: true } } } } },
  });
}

export { loadCatalog as loadUniformCatalog };
