import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { isPermanentRenewal } from "@/lib/subscription-core";

/** "unpaid": signed up but never paid; "expired": paid once, lapsed since. */
export type SubscriptionState = "active" | "unpaid" | "expired" | "blocked";

export type SchoolRow = {
  id: string;
  name: string;
  city: string | null;
  type: string | null;
  contactName: string;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  blocked: boolean;
  blockedReason: string | null;
  state: SubscriptionState;
  /** Days until renewal; negative once past. */
  daysLeft: number | null;
  renewsAt: Date | null;
  permanent: boolean;
  counts: { classes: number; students: number; payments: number };
  paidTotal: number;
  lastPaymentAt: Date | null;
};

const DAY = 1000 * 60 * 60 * 24;

function daysFromNow(date: Date | null, now: Date) {
  if (!date) return null;
  return Math.ceil((date.getTime() - now.getTime()) / DAY);
}

/** How the platform sees a school: blocked wins, then paid. There is no free trial. */
export function subscriptionState(school: {
  blocked: boolean;
  subscriptionStatus: string;
  subscriptionRenewsAt: Date | null;
}, now: Date): SubscriptionState {
  if (school.blocked) return "blocked";
  if (school.subscriptionStatus === "active") {
    const stillValid = !school.subscriptionRenewsAt || school.subscriptionRenewsAt.getTime() > now.getTime();
    return stillValid ? "active" : "expired";
  }
  return school.subscriptionRenewsAt ? "expired" : "unpaid";
}

export const getAdminOverview = cache(async () => {
  const now = new Date();

  const schools = await prisma.school.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { classes: true, students: true, payments: true } },
      subscriptionPayments: { where: { status: "success" }, orderBy: { createdAt: "desc" } },
    },
  });

  const rows: SchoolRow[] = schools.map((s) => {
    const state = subscriptionState(s, now);
    return {
      id: s.id,
      name: s.name,
      city: s.city,
      type: s.type,
      contactName: s.contactName,
      phone: s.phone,
      email: s.email,
      createdAt: s.createdAt,
      blocked: s.blocked,
      blockedReason: s.blockedReason,
      state,
      daysLeft: daysFromNow(s.subscriptionRenewsAt, now),
      renewsAt: s.subscriptionRenewsAt,
      permanent: state === "active" && isPermanentRenewal(s.subscriptionRenewsAt),
      counts: { classes: s._count.classes, students: s._count.students, payments: s._count.payments },
      paidTotal: s.subscriptionPayments.reduce((sum, p) => sum + p.amount, 0),
      lastPaymentAt: s.subscriptionPayments[0]?.createdAt ?? null,
    };
  });

  const byState = (state: SubscriptionState) => rows.filter((r) => r.state === state).length;

  // Monthly recurring revenue: a yearly plan counts as its per-month share.
  // A school with no recorded payment at all — a permanent/free account made
  // active by an admin rather than by paying — contributes nothing: it isn't
  // assumed to be on the monthly plan just because it's "active".
  const activeRows = rows.filter((r) => r.state === "active" && r.paidTotal > 0);
  const yearlyShare = Math.round(PLANS.yearly.amount / 12);
  const mrr = activeRows.reduce((sum, r) => {
    return sum + (r.paidTotal >= PLANS.yearly.amount ? yearlyShare : PLANS.monthly.amount);
  }, 0);

  const openErrors = await prisma.errorLog.count({ where: { resolvedAt: null } });

  return {
    rows,
    stats: {
      total: rows.length,
      active: byState("active"),
      unpaid: byState("unpaid"),
      expired: byState("expired"),
      blocked: byState("blocked"),
      students: rows.reduce((s, r) => s + r.counts.students, 0),
      revenue: rows.reduce((s, r) => s + r.paidTotal, 0),
      mrr,
      openErrors,
      /** Subscriptions ending within a week — the ones worth a call. */
      endingSoon: rows.filter((r) => r.state === "active" && !r.permanent && r.daysLeft !== null && r.daysLeft <= 7)
        .length,
    },
  };
});

export type PendingPayment = {
  id: string;
  schoolId: string;
  schoolName: string;
  amount: number;
  provider: string;
  phone: string;
  createdAt: Date;
};

/** Payments a school says it sent, waiting for an admin to check the Mobile Money account and confirm. */
export const getPendingSubscriptionPayments = cache(async (): Promise<PendingPayment[]> => {
  const payments = await prisma.subscriptionPayment.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { school: { select: { id: true, name: true } } },
  });
  return payments.map((p) => ({
    id: p.id,
    schoolId: p.school.id,
    schoolName: p.school.name,
    amount: p.amount,
    provider: p.provider,
    phone: p.phone,
    createdAt: p.createdAt,
  }));
});

export const getSchoolDetail = cache(async (schoolId: string) => {
  const now = new Date();
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: {
      _count: { select: { classes: true, students: true, payments: true, reminders: true } },
      subscriptionPayments: { orderBy: { createdAt: "desc" }, take: 20 },
      academicYears: { orderBy: { createdAt: "desc" }, select: { label: true, isCurrent: true } },
      errorLogs: { orderBy: { lastSeenAt: "desc" }, take: 5 },
    },
  });
  if (!school) return null;

  return { school, state: subscriptionState(school, now), daysLeft: daysFromNow(school.subscriptionRenewsAt, now) };
});

export const getErrorLogs = cache(async (filter: "open" | "resolved" | "all" = "open") => {
  const where =
    filter === "open" ? { resolvedAt: null } : filter === "resolved" ? { NOT: { resolvedAt: null } } : {};

  const [errors, openCount, resolvedCount] = await Promise.all([
    prisma.errorLog.findMany({
      where,
      orderBy: [{ lastSeenAt: "desc" }],
      take: 100,
      include: { school: { select: { name: true } } },
    }),
    prisma.errorLog.count({ where: { resolvedAt: null } }),
    prisma.errorLog.count({ where: { NOT: { resolvedAt: null } } }),
  ]);

  return { errors, openCount, resolvedCount };
});
