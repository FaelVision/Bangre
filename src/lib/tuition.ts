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

  const trancheStates = computeTrancheStates(student.class.tranches, student.payments, now);
  const paid = trancheStates.reduce((sum, t) => sum + t.paid, 0);
  const remaining = Math.max(0, tuition - paid);
  const percent = tuition > 0 ? Math.round((paid / tuition) * 100) : 0;
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
    total: tuition,
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

export const studentQueryInclude = {
  class: { include: { tranches: true } },
  payments: { include: { allocations: true } },
} as const;
