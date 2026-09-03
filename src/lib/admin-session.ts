import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cookieSecure } from "@/lib/session";

/**
 * The platform administrator's session. Deliberately a separate cookie and a
 * separate payload shape from the school session: an admin is not a school,
 * and neither cookie should ever be mistaken for the other.
 */
const ADMIN_COOKIE = "bangre_admin";
const secretKey = process.env.SESSION_SECRET || "insecure-dev-secret-change-me";
const encodedKey = new TextEncoder().encode(secretKey);

export type AdminSessionPayload = { adminId: string };

export async function createAdminSession(adminId: string) {
  const token = await new SignJWT({ adminId, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey);

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function decryptAdminSession(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ["HS256"] });
    if (payload.role !== "admin" || typeof payload.adminId !== "string") return null;
    return { adminId: payload.adminId } satisfies AdminSessionPayload;
  } catch {
    return null;
  }
}

export async function getAdminSessionCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_COOKIE)?.value;
}

export async function deleteAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE);
}

export { ADMIN_COOKIE };
