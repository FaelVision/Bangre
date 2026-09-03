import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { decryptSession, getSessionCookie } from "@/lib/session";
import { prisma } from "@/lib/db";

export const verifySession = cache(async () => {
  const token = await getSessionCookie();
  const session = await decryptSession(token);
  if (!session?.schoolId) {
    redirect("/connexion");
  }
  return { schoolId: session.schoolId };
});

export const getCurrentSchool = cache(async () => {
  const { schoolId } = await verifySession();
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) {
    // Valid JWT, but the school it points to is gone (deleted, or the dev
    // database was reseeded). Go through /deconnexion so the stale cookie is
    // cleared — a plain redirect to /connexion loops against the proxy.
    redirect("/deconnexion");
  }
  return school;
});

/**
 * Whether the school currently has paid access. "active" alone is not enough:
 * a subscription that lapsed (its renewal date is in the past) no longer counts,
 * otherwise a school that stopped paying would keep the app forever.
 */
export function hasCurrentSubscription(school: {
  subscriptionStatus: string;
  subscriptionRenewsAt: Date | null;
}) {
  if (school.subscriptionStatus !== "active") return false;
  if (!school.subscriptionRenewsAt) return true; // legacy rows with no end date
  return school.subscriptionRenewsAt.getTime() > Date.now();
}

export const requireActiveSubscription = cache(async () => {
  const school = await getCurrentSchool();

  // Suspension by the platform administrator takes precedence over everything:
  // the account still exists and keeps its data, but the app is out of reach.
  if (school.blocked) {
    redirect("/compte-suspendu");
  }

  const trialExpired = school.trialEndsAt ? school.trialEndsAt.getTime() < Date.now() : false;
  if (!hasCurrentSubscription(school) && trialExpired) {
    redirect("/abonnement?expire=1");
  }
  return school;
});

export const getCurrentAcademicYear = cache(async () => {
  const { schoolId } = await verifySession();
  let year = await prisma.academicYear.findFirst({
    where: { schoolId, isCurrent: true },
  });
  if (!year) {
    year = await prisma.academicYear.findFirst({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
    });
  }
  return year;
});
