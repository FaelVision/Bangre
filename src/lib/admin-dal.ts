import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { decryptAdminSession, getAdminSessionCookie } from "@/lib/admin-session";

export const verifyAdmin = cache(async () => {
  const session = await decryptAdminSession(await getAdminSessionCookie());
  if (!session?.adminId) redirect("/admin/connexion");

  const admin = await prisma.admin.findUnique({
    where: { id: session.adminId },
    select: { id: true, name: true, phone: true },
  });
  // The account can have been deleted since the cookie was issued. Clear the
  // cookie via /admin/deconnexion; redirecting straight to /admin/connexion
  // loops against the proxy, which still trusts the valid JWT.
  if (!admin) redirect("/admin/deconnexion");

  return admin;
});

/** True when at least one administrator exists — drives the first-run notice. */
export const hasAnyAdmin = cache(async () => (await prisma.admin.count()) > 0);
