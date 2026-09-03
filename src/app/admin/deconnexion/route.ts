import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { deleteAdminSession } from "@/lib/admin-session";

/**
 * Admin counterpart of /deconnexion: clears the admin cookie and returns to the
 * admin login. Used when the admin JWT is still valid but its account no longer
 * exists — redirecting straight to /admin/connexion would let the proxy bounce
 * the still-cookied request back to /admin in an endless loop.
 */
export async function GET(req: NextRequest) {
  await deleteAdminSession();
  return NextResponse.redirect(new URL("/admin/connexion", req.url));
}
