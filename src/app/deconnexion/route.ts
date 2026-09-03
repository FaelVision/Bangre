import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { deleteSession } from "@/lib/session";

/**
 * Clears the school session cookie, then sends the visitor to the login page.
 *
 * A cookie can only be mutated in a Route Handler or the proxy, never during a
 * Server Component render. So when something downstream discovers the session is
 * stale — its school was deleted, the database was reseeded — it redirects here
 * instead of straight to /connexion. Otherwise the proxy still sees a valid JWT,
 * bounces the request back to the dashboard, and the two redirects loop forever
 * ("localhost redirected you too many times").
 */
export async function GET(req: NextRequest) {
  await deleteSession();
  return NextResponse.redirect(new URL("/connexion", req.url));
}
