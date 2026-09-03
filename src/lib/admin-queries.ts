import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { PLANS } from "@/lib/plans";

export type SubscriptionState = "active" | "trial" | "expired" | "blocked";

export type SchoolRow = {
  id: string;
  name: string;
  city: string | null;
  type: string | null;
  contactName: string;
  phone: string;
  email: string | null;
  createdAt: Date;
  blocked: boolean;
  blockedReason: string | null;
  state: SubscriptionState;
  /** Days left on the trial, or until renewal; negative once past. */
  daysLeft: number | null;
  renewsAt: Date | null;
  trialEndsAt: Date | null;
  counts: { classes: number; students: number; payments: number };
  paidTotal: number;
  lastPaymentAt: Date | null;
};

const DAY = 1000 * 60 * 60 * 24;

function daysFromNow(date: Date | null, now: Date) {
  if (!date) return null;
  return Math.ceil((date.getTime() - now.getTime()) / DAY);
}

/** How the platform sees a school: blocked wins, then paid, then trial. */
export function subscriptionState(school: {
  blocked: boolean;
  subscriptionStatus: string;
  subscriptionRenewsAt: Date | null;
  trialEndsAt: Date | null;
}, now: Date): SubscriptionState {
  if (school.blocked) return "blocked";
  if (school.subscriptionStatus === "active") {
    const stillValid = !school.subscriptionRenewsAt || school.subscriptionRenewsAt.getTime() > now.getTime();
    return stillValid ? "active" : "expired";
  }
  if (school.trialEndsAt && school.trialEndsAt.getTime() > now.getTime()) return "trial";
  return "expired";
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
    const reference = state === "active" ? s.subscriptionRenewsAt : s.trialEndsAt;
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
      daysLeft: daysFromNow(reference, now),
      renewsAt: s.subscriptionRenewsAt,
      trialEndsAt: s.trialEndsAt,
      counts: { classes: s._count.classes, students: s._count.students, payments: s._count.payments },
      paidTotal: s.subscriptionPayments.reduce((sum, p) => sum + p.amount, 0),
      lastPaymentAt: s.subscriptionPayments[0]?.createdAt ?? null,
    };
  });

  const byState = (state: SubscriptionState) => rows.filter((r) => r.state === state).length;

  // Monthly recurring revenue: a yearly plan counts as its per-month share.
  const activeRows = rows.filter((r) => r.state === "active");
  const yearlyShare = Math.round(PLANS.yearly.amount / 12);
  const mrr = activeRows.reduce((sum, r) => {
    const lastAmount = r.paidTotal > 0 ? r.paidTotal : 0;
    return sum + (lastAmount >= PLANS.yearly.amount ? yearlyShare : PLANS.monthly.amount);
  }, 0);

  const openErrors = await prisma.errorLog.count({ where: { resolvedAt: null } });

  return {
    rows,
    stats: {
      total: rows.length,
      active: byState("active"),
      trial: byState("trial"),
      expired: byState("expired"),
      blocked: byState("blocked"),
      students: rows.reduce((s, r) => s + r.counts.students, 0),
      revenue: rows.reduce((s, r) => s + r.paidTotal, 0),
      mrr,
      openErrors,
      /** Trials ending within a week — the ones worth a call. */
      endingSoon: rows.filter((r) => r.state === "trial" && r.daysLeft !== null && r.daysLeft <= 7).length,
    },
  };
});

export const getSchoolDetail = cache(async (schoolId: string) => {
  const now = new Date();
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: {
      _count: { select: { classes: true, students: true, payments: true, reminders: true } },
      subscriptionPayments: { orderBy: { createdAt: "desc" }, take: 20 },
      adminMessages: { orderBy: { createdAt: "desc" }, take: 20, include: { admin: { select: { name: true } } } },
      academicYears: { orderBy: { createdAt: "desc" }, select: { label: true, isCurrent: true } },
      errorLogs: { orderBy: { lastSeenAt: "desc" }, take: 5 },
    },
  });
  if (!school) return null;

  return { school, state: subscriptionState(school, now), daysLeft: daysFromNow(
    subscriptionState(school, now) === "active" ? school.subscriptionRenewsAt : school.trialEndsAt,
    now
  ) };
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
