import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decryptSession } from "@/lib/session";

const PUBLIC_PATHS = ["/connexion", "/inscription"];
const SESSION_COOKIE = "bangre_session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
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
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|ico)$).*)"],
};
