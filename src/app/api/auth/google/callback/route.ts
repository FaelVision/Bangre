import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { exchangeGoogleCode, googleRedirectUri, isGoogleConfigured } from "@/lib/google";
import { createSession, setPendingGoogleLink, takeOAuthState } from "@/lib/session";

function back(req: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/connexion?google=${reason}`, req.url));
}

export async function GET(req: NextRequest) {
  if (!isGoogleConfigured()) return back(req, "non_configure");

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return back(req, "annule");

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = await takeOAuthState();

  if (!code || !state || !expectedState || state !== expectedState) {
    return back(req, "etat_invalide");
  }

  let profile;
  try {
    profile = await exchangeGoogleCode(code, googleRedirectUri(req));
  } catch (error) {
    console.error("[google] échec de la connexion :", error);
    return back(req, "echec");
  }

  if (!profile.emailVerified) return back(req, "email_non_verifie");

  // Already linked, or an account exists with that email → sign in.
  const school = await prisma.school.findFirst({
    where: { OR: [{ googleId: profile.sub }, { email: profile.email }] },
  });

  if (school) {
    if (school.googleId !== profile.sub) {
      await prisma.school.update({
        where: { id: school.id },
        data: { googleId: profile.sub, avatarUrl: profile.picture ?? school.avatarUrl },
      });
    }
    await createSession(school.id);
    return NextResponse.redirect(new URL("/tableau-de-bord", req.url));
  }

  // No account yet: the establishment details (name, city, phone) still have to
  // be filled in, so carry the verified identity over to the signup form.
  await setPendingGoogleLink({
    googleId: profile.sub,
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
  });
  return NextResponse.redirect(new URL("/inscription?google=1", req.url));
}
