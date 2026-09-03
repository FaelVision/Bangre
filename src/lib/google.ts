import "server-only";

/**
 * Google "Sign in with Google" (OAuth 2.0 authorization code flow).
 *
 * Unlike WhatsApp and Mobile Money, this has no simulation fallback: pretending
 * a Google identity was verified would let anyone sign in as anyone. When the
 * credentials are missing the button is simply disabled with an explanation.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

export function isGoogleConfigured() {
  return googleConfig().configured;
}

/**
 * The redirect URI must match one registered in the Google Cloud console, and
 * be identical between the authorize call and the token exchange.
 *
 * It is read from the Host header rather than `req.url`, which Next normalises
 * to the server's own origin — deriving it from that sent phones on the school
 * network back to `localhost`. Set GOOGLE_REDIRECT_URI to pin a single value
 * (Google only accepts public domains and `localhost`, never a LAN IP).
 */
export function googleRedirectUri(req: Request) {
  const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return new URL("/api/auth/google/callback", req.url).toString();

  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}/api/auth/google/callback`;
}

export function googleAuthUrl({ redirectUri, state }: { redirectUri: string; state: string }) {
  const { clientId } = googleConfig();
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID manquant.");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
};

/** Exchanges the one-time code for tokens, then reads the user's profile. */
export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleProfile> {
  const { clientId, clientSecret } = googleConfig();
  if (!clientId || !clientSecret) throw new Error("Identifiants Google manquants.");

  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Échange du code Google refusé (${tokenRes.status}).`);
  }

  const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string };
  if (!accessToken) throw new Error("Réponse Google sans jeton d'accès.");

  const userRes = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) throw new Error(`Profil Google illisible (${userRes.status}).`);

  const profile = (await userRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  if (!profile.sub || !profile.email) throw new Error("Profil Google incomplet.");

  return {
    sub: profile.sub,
    email: profile.email.toLowerCase(),
    emailVerified: profile.email_verified !== false,
    name: profile.name?.trim() || profile.email.split("@")[0],
    picture: profile.picture,
  };
}
