import type { Tranche, PaymentAllocation, Payment, Student, SchoolClass } from "@prisma/client";
import { formatAmount, daysBetween } from "@/lib/format";

export type ClassWithTranches = SchoolClass & { tranches: Tranche[] };
export type PaymentWithAllocations = Payment & { allocations: PaymentAllocation[] };
export type StudentWithPayments = Student & {
  class: ClassWithTranches;
  payments: PaymentWithAllocations[];
};

export type TrancheState = {
  tranche: Tranche;
  paid: number;
  remaining: number;
  status: "paid" | "partial" | "late" | "pending";
  daysLate: number;
};

/**
 * Tranches belong to a class and are shared by every student in it — a
 * PaymentAllocation on a tranche can come from any of those students. To
 * get one student's paid amount per tranche we must sum allocations from
 * that student's own payments only, never from `tranche.allocations`
 * directly (which would mix in every classmate's payments).
 */
export function computeTrancheStates(
  tranches: Tranche[],
  studentPayments: PaymentWithAllocations[],
  now: Date = new Date()
): TrancheState[] {
  const paidByTranche = new Map<string, number>();
  for (const payment of studentPayments) {
    for (const alloc of payment.allocations) {
      paidByTranche.set(alloc.trancheId, (paidByTranche.get(alloc.trancheId) ?? 0) + alloc.amount);
    }
  }

  return tranches
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((t) => {
      const paid = paidByTranche.get(t.id) ?? 0;
      const remaining = Math.max(0, t.amount - paid);
      const isLate = remaining > 0 && t.dueDate.getTime() < now.getTime();
      let status: TrancheState["status"] = "pending";
      if (remaining <= 0) status = "paid";
      else if (isLate) status = "late";
      else if (paid > 0) status = "partial";
      const daysLate = isLate ? daysBetween(now, t.dueDate) : 0;
      return { tranche: t, paid, remaining, status, daysLate };
    });
}

export type StudentSummary = {
  total: number;
  paid: number;
  remaining: number;
  percent: number;
  overdueAmount: number;
  overdueTranches: TrancheState[];
  trancheStates: TrancheState[];
  status: "solde" | "partiel" | "retard" | "attente" | "non_defini";
  statusLabel: string;
};

/** The one-off enrolment fee for a class, materialised as its "registration" tranche. */
export function registrationFeeOf(clazz: ClassWithTranches): number {
  return clazz.tranches.find((t) => t.kind === "registration")?.amount ?? 0;
}

export function computeStudentSummary(
  student: StudentWithPayments,
  now: Date = new Date()
): StudentSummary {
  const tuition = student.tuitionOverride ?? student.class.tuitionAmount;

  if (tuition == null) {
    return {
      total: 0,
      paid: 0,
      remaining: 0,
      percent: 0,
      overdueAmount: 0,
      overdueTranches: [],
      trancheStates: [],
      status: "non_defini",
      statusLabel: "Scolarité non définie",
    };
  }

  // The enrolment fee is billed on top of the tuition; it flows through the
  // tranche machinery as the class's "registration" tranche (ordered first).
  const total = tuition + registrationFeeOf(student.class);

  const trancheStates = computeTrancheStates(student.class.tranches, student.payments, now);
  const paid = trancheStates.reduce((sum, t) => sum + t.paid, 0);
  const remaining = Math.max(0, total - paid);
  const percent = total > 0 ? Math.round((paid / total) * 100) : 0;
  const overdueTranches = trancheStates.filter((t) => t.status === "late");
  const overdueAmount = overdueTranches.reduce((sum, t) => sum + t.remaining, 0);

  let status: StudentSummary["status"];
  let statusLabel: string;

  if (remaining <= 0 && trancheStates.length > 0) {
    status = "solde";
    statusLabel = "Soldé";
  } else if (overdueTranches.length > 0) {
    status = "retard";
    statusLabel = `En retard · ${formatAmount(overdueAmount)} dus`;
  } else if (paid > 0) {
    const next = trancheStates.find((t) => t.status !== "paid");
    status = "partiel";
    statusLabel = next ? `${next.tranche.label} en attente` : "Partiel";
  } else {
    status = "attente";
    statusLabel = "En attente";
  }

  return {
    total,
    paid,
    remaining,
    percent,
    overdueAmount,
    overdueTranches,
    trancheStates,
    status,
    statusLabel,
  };
}

/**
 * How a received amount is spread over the tranches still due. Shared by the
 * server (which persists the allocations, `payments-core.ts`) and by the
 * device (which shows the very same breakdown for a payment taken offline,
 * before the server has seen it) so both tell the user the same thing.
 *
 * Tranche mode pays the selected tranches in full; partial mode fills the
 * unpaid tranches in order until the amount runs out.
 */
export type PaymentAllocationResult =
  | { ok: true; allocations: { trancheId: string; amount: number }[]; amount: number }
  | { ok: false; error: string };

export function allocatePayment(
  trancheStates: TrancheState[],
  input: { mode: "tranches" | "partial"; trancheIds: string[]; amount: number }
): PaymentAllocationResult {
  const unpaid = trancheStates
    .filter((t) => t.remaining > 0)
    .sort((a, b) => a.tranche.order - b.tranche.order);

  const allocations: { trancheId: string; amount: number }[] = [];

  if (input.mode === "tranches") {
    const wanted = new Set(input.trancheIds);
    for (const t of unpaid) {
      if (wanted.has(t.tranche.id)) allocations.push({ trancheId: t.tranche.id, amount: t.remaining });
    }
    if (allocations.length === 0) return { ok: false, error: "Sélectionnez au moins une tranche." };
  } else {
    let budget = Math.round(input.amount);
    if (budget <= 0) return { ok: false, error: "Montant invalide." };
    for (const t of unpaid) {
      if (budget <= 0) break;
      const take = Math.min(budget, t.remaining);
      if (take > 0) {
        allocations.push({ trancheId: t.tranche.id, amount: take });
        budget -= take;
      }
    }
    if (allocations.length === 0) return { ok: false, error: "Toutes les tranches sont déjà payées." };
  }

  const amount = allocations.reduce((s, a) => s + a.amount, 0);
  if (amount <= 0) return { ok: false, error: "Montant invalide." };
  return { ok: true, allocations, amount };
}

export const studentQueryInclude = {
  class: { include: { tranches: true } },
  payments: { include: { allocations: true } },
} as const;
