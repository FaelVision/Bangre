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
    redirect("/connexion");
  }
  return school;
});

export const requireActiveSubscription = cache(async () => {
  const school = await getCurrentSchool();
  const trialExpired = school.trialEndsAt ? school.trialEndsAt.getTime() < Date.now() : false;
  if (school.subscriptionStatus !== "active" && trialExpired) {
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
