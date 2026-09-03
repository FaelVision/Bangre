import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "bangre_session";
const secretKey = process.env.SESSION_SECRET || "insecure-dev-secret-change-me";
const encodedKey = new TextEncoder().encode(secretKey);

/**
 * Bangre runs over plain HTTP on the school's local network (http://192.168.x.x),
 * where a `Secure` cookie is never sent back and the app locks everyone out. So
 * `Secure` is opt-in via COOKIE_SECURE=true — set it only behind HTTPS.
 */
export const cookieSecure = process.env.COOKIE_SECURE === "true";

export type SessionPayload = {
  schoolId: string;
};

export async function encryptSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(encodedKey);
}

export async function decryptSession(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ["HS256"] });
    return payload as SessionPayload & { iat: number; exp: number };
  } catch {
    return null;
  }
}

export async function createSession(schoolId: string) {
  const token = await encryptSession({ schoolId });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getSessionCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// --- Google sign-in ---------------------------------------------------------

const OAUTH_STATE_COOKIE = "bangre_oauth_state";
const GOOGLE_LINK_COOKIE = "bangre_google_link";

const shortCookie = {
  httpOnly: true as const,
  secure: cookieSecure,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 15,
};

/** One-time value echoed back by Google, to reject forged callbacks (CSRF). */
export async function setOAuthState(state: string) {
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, shortCookie);
}

export async function takeOAuthState() {
  const cookieStore = await cookies();
  const value = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);
  return value;
}

export type PendingGoogleLink = { googleId: string; email: string; name: string; picture?: string };

/**
 * A Google identity verified by us but not yet attached to a school — the
 * person still has to fill in the establishment form. Signed so the signup
 * action can trust it without a database round-trip.
 */
export async function setPendingGoogleLink(link: PendingGoogleLink) {
  const token = await new SignJWT(link)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(encodedKey);
  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_LINK_COOKIE, token, shortCookie);
}

export async function readPendingGoogleLink(): Promise<PendingGoogleLink | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(GOOGLE_LINK_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ["HS256"] });
    return payload as unknown as PendingGoogleLink;
  } catch {
    return null;
  }
}

export async function clearPendingGoogleLink() {
  const cookieStore = await cookies();
  cookieStore.delete(GOOGLE_LINK_COOKIE);
}

export { SESSION_COOKIE };
