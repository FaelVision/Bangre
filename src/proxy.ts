import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decryptSession } from "@/lib/session";
import { decryptAdminSession } from "@/lib/admin-session";

const PUBLIC_PATHS = ["/connexion", "/inscription"];
// Reachable in every state, whether signed in or not: the service worker
// precaches the offline fallback, which must not depend on a session or
// bounce signed-in users away; password reset is the only way to change a
// password (there's no such setting once signed in), so it must stay usable
// even for a signed-in school; the privacy policy is public information.
const ALWAYS_ALLOWED = [
  "/hors-ligne",
  "/mot-de-passe-oublie",
  "/reinitialiser-mot-de-passe",
  "/confidentialite",
];
const SESSION_COOKIE = "bangre_session";
const ADMIN_COOKIE = "bangre_admin";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The admin area is a separate realm with its own credentials: a school
  // session grants nothing here, and an admin session grants nothing there.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const admin = await decryptAdminSession(req.cookies.get(ADMIN_COOKIE)?.value);
    const isAdminLogin = pathname === "/admin/connexion";

    if (!admin && !isAdminLogin) {
      return NextResponse.redirect(new URL("/admin/connexion", req.url));
    }
    if (admin && isAdminLogin) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return NextResponse.next();
  }

  if (ALWAYS_ALLOWED.includes(pathname)) return NextResponse.next();

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await decryptSession(token);
  const isAuthenticated = Boolean(session?.schoolId);

  if (!isAuthenticated && !isPublic && pathname !== "/") {
    return NextResponse.redirect(new URL("/connexion", req.url));
  }

  if (isAuthenticated && isPublic) {
    return NextResponse.redirect(new URL("/tableau-de-bord", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Files served from public/ must never be redirected. The service worker in
  // particular is fetched with `redirect: "error"`, so sending it to /connexion
  // (which happened for every logged-out or expired-session update check)
  // silently killed offline mode.
  matcher: ["/((?!api|_next/static|_next/image|sw\\.js|manifest\\.webmanifest|robots\\.txt|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
