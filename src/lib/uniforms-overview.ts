import type { Student } from "@prisma/client";
import { undoableToday } from "@/lib/canteen-overview";
import {
  activeVariants,
  describeLines,
  itemLevels,
  itemOffered,
  type UniformItemWithVariants,
  type UniformSaleWithLines,
} from "@/lib/uniforms";

/**
 * What the Tenues screens show, computed from one `UniformDataset`. The server
 * fills it from the database (`uniforms-core.ts`), the device from its local
 * copy (`offline-data.ts`): both read identical figures.
 */

export type UniformStudent = Pick<
  Student,
  "id" | "firstName" | "lastName" | "matricule" | "classId" | "status" | "parentPhone"
> & { class: { name: string; level: string } };

export type UniformDataset = {
  enabled: boolean;
  schoolName: string;
  contactName: string;
  receiptCounter: number;
  yearLabel: string;
  /** Every tenue, archived ones included (old receipts name them). */
  catalog: UniformItemWithVariants[];
  students: UniformStudent[];
  /** This academic year's sales, newest first. */
  sales: UniformSaleWithLines[];
  /** False on the device: cancelling a sale is done online. */
  online: boolean;
};

export const UNIFORM_PAGE_SIZE = 25;

export type UniformVue = "ventes" | "a-remettre" | "stock";

export function parseUniformVue(value: string | null | undefined): UniformVue {
  return value === "a-remettre" || value === "stock" ? value : "ventes";
}

/** Pieces paid and not handed over yet, on sales still standing. */
function undelivered(sale: UniformSaleWithLines) {
  return sale.cancelledAt ? [] : sale.lines.filter((l) => !l.deliveredAt);
}

/** The sidebar badge: tenues paid and still to hand over. */
export function uniformsToDeliverCount(ds: UniformDataset) {
  if (!ds.enabled) return 0;
  return ds.sales.reduce((n, s) => n + undelivered(s).reduce((m, l) => m + l.quantity, 0), 0);
}

export function uniformsOverview(
  ds: UniformDataset,
  filter: { vue?: string; q?: string; page?: number } = {},
  now: Date = new Date()
) {
  const vue = parseUniformVue(filter.vue);
  const studentById = new Map(ds.students.map((s) => [s.id, s]));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const standing = ds.sales.filter((s) => !s.cancelledAt);
  const thisMonth = standing.filter((s) => s.date.getTime() >= startOfMonth.getTime());

  const q = filter.q?.trim().toLowerCase();
  const matches = (studentId: string) => {
    if (!q) return true;
    const st = studentById.get(studentId);
    return (
      !!st &&
      (st.lastName.toLowerCase().includes(q) ||
        st.firstName.toLowerCase().includes(q) ||
        st.matricule.toLowerCase().includes(q))
    );
  };

  const sorted = [...ds.sales].sort((a, b) => b.date.getTime() - a.date.getTime() || b.receiptNumber - a.receiptNumber);
  const list =
    vue === "a-remettre"
      ? sorted.filter((s) => undelivered(s).length > 0 && matches(s.studentId))
      : vue === "ventes"
        ? sorted.filter((s) => matches(s.studentId))
        : [];

  const page = Math.max(1, filter.page ?? 1);
  const start = (page - 1) * UNIFORM_PAGE_SIZE;

  // What each size sold this year, for the stock view.
  const soldByVariant = new Map<string, number>();
  for (const s of standing) for (const l of s.lines) soldByVariant.set(l.variantId, (soldByVariant.get(l.variantId) ?? 0) + l.quantity);

  const catalog = ds.catalog
    .filter((i) => !i.archived)
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      id: item.id,
      name: item.name,
      levels: itemLevels(item),
      trackStock: item.trackStock,
      variants: activeVariants(item).map((v) => ({
        id: v.id,
        size: v.size,
        price: v.price,
        stock: v.stock,
        sold: soldByVariant.get(v.id) ?? 0,
      })),
    }));
  const outOfStock = catalog.flatMap((i) => (i.trackStock ? i.variants.filter((v) => v.stock <= 0) : []));

  return {
    enabled: ds.enabled,
    yearLabel: ds.yearLabel,
    vue,
    filters: { q: filter.q },
    hasCatalog: catalog.length > 0,
    stats: {
      monthCollected: thisMonth.reduce((s, x) => s + x.amount, 0),
      monthReceipts: thisMonth.length,
      toDeliver: uniformsToDeliverCount(ds),
      outOfStock: outOfStock.length,
      offlineCount: ds.sales.filter((s) => !s.synced).length,
    },
    sales: list.slice(start, start + UNIFORM_PAGE_SIZE).map((s) => {
      const st = studentById.get(s.studentId);
      const toHand = undelivered(s);
      return {
        id: s.id,
        studentId: s.studentId,
        studentName: st ? `${st.lastName} ${st.firstName}` : "Élève supprimé",
        className: st?.class.name ?? "—",
        receiptNumber: s.receiptNumber,
        date: s.date,
        description: describeLines(s.lines),
        amount: s.amount,
        synced: s.synced,
        cancelled: s.cancelledAt != null,
        cancelReason: s.cancelReason,
        lines: s.lines.map((l) => ({ id: l.id, label: l.label, quantity: l.quantity, delivered: l.deliveredAt != null })),
        toDeliver: toHand.reduce((n, l) => n + l.quantity, 0),
        canCancel: ds.online && !s.cancelledAt && s.synced && undoableToday(s.createdAt, now),
      };
    }),
    catalog: vue === "stock" ? catalog : [],
    page,
    pageCount: Math.max(1, Math.ceil(list.length / UNIFORM_PAGE_SIZE)),
    /** Who the "Vente de tenue" search offers: every active student. */
    sellable: ds.students
      .filter((s) => s.status === "active")
      .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr"))
      .map((s) => ({ id: s.id, label: `${s.lastName} ${s.firstName} · ${s.class.name} · ${s.matricule}` })),
    online: ds.online,
  };
}

export type UniformsOverview = ReturnType<typeof uniformsOverview>;

/** What the sale window needs about one student: the tenues offered to their level. */
export type UniformSaleContext = {
  student: { id: string; firstName: string; lastName: string; matricule: string; className: string };
  schoolName: string;
  receivedByDefault: string;
  nextReceiptNumber: number;
  items: {
    id: string;
    name: string;
    trackStock: boolean;
    variants: { id: string; size: string; price: number; stock: number }[];
  }[];
};

export function uniformSaleContext(ds: UniformDataset, studentId: string): UniformSaleContext | { error: string } {
  if (!ds.enabled) return { error: "Les tenues ne sont pas activées pour cet établissement." };
  const student = ds.students.find((s) => s.id === studentId);
  if (!student) return { error: "Élève introuvable." };
  const items = ds.catalog
    .filter((i) => itemOffered(i, student.class.level))
    .sort((a, b) => a.order - b.order)
    .map((i) => ({
      id: i.id,
      name: i.name,
      trackStock: i.trackStock,
      variants: activeVariants(i).map((v) => ({ id: v.id, size: v.size, price: v.price, stock: v.stock })),
    }))
    .filter((i) => i.variants.length > 0);
  if (items.length === 0) {
    return {
      error: ds.catalog.some((i) => !i.archived)
        ? `Aucune tenue du catalogue n'est proposée au niveau ${student.class.level.toLowerCase()}.`
        : "Le catalogue des tenues est vide : ajoutez vos tenues dans les réglages.",
    };
  }
  return {
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      matricule: student.matricule,
      className: student.class.name,
    },
    schoolName: ds.schoolName,
    receivedByDefault: ds.contactName,
    nextReceiptNumber: ds.receiptCounter + 1,
    items,
  };
}

/** The tenues on a student file. Null when the school does not sell them. */
export function uniformStudentCard(ds: UniformDataset, studentId: string) {
  if (!ds.enabled) return null;
  const sales = ds.sales
    .filter((s) => s.studentId === studentId)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  return {
    sales: sales.map((s) => ({
      id: s.id,
      date: s.date,
      receiptNumber: s.receiptNumber,
      amount: s.amount,
      description: describeLines(s.lines),
      cancelled: s.cancelledAt != null,
      synced: s.synced,
      toDeliver: undelivered(s).reduce((n, l) => n + l.quantity, 0),
      lines: s.lines.map((l) => ({ id: l.id, label: l.label, quantity: l.quantity, delivered: l.deliveredAt != null })),
    })),
    online: ds.online,
  };
}

export type UniformStudentCard = NonNullable<ReturnType<typeof uniformStudentCard>>;
