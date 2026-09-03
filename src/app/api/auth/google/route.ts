import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { googleAuthUrl, googleRedirectUri, isGoogleConfigured } from "@/lib/google";
import { setOAuthState } from "@/lib/session";

/** Starts the Google sign-in flow. */
export async function GET(req: NextRequest) {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/connexion?google=non_configure", req.url));
  }

  const state = crypto.randomUUID();
  await setOAuthState(state);

  const url = googleAuthUrl({ redirectUri: googleRedirectUri(req), state });
  return NextResponse.redirect(url);
}
