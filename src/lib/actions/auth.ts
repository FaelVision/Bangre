"use server";

import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, deleteSession, readPendingGoogleLink, clearPendingGoogleLink } from "@/lib/session";
import { createAdminSession } from "@/lib/admin-session";
import {
  LoginSchema,
  SchoolDetailsSchema,
  PasswordSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  parseIdentifier,
} from "@/lib/validation";
import { currentAcademicYearLabel } from "@/lib/promotion";
import { sendEmail } from "@/lib/mailer";

export type AuthActionState = { error?: string } | undefined;

export async function signupAction(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  // A Google identity we verified in the OAuth callback; when present the
  // person signs in with Google instead of choosing a password.
  const googleLink = await readPendingGoogleLink();

  const fields = {
    schoolName: formData.get("schoolName"),
    city: formData.get("city"),
    type: formData.get("type"),
    contactName: formData.get("contactName"),
    phone: formData.get("phone"),
    // When a Google identity is attached the email is already fixed by it;
    // the form doesn't collect one, so there's nothing to parse here.
    email: googleLink ? undefined : formData.get("email"),
  };

  const parsed = SchoolDetailsSchema.safeParse(fields);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { schoolName, city, type, contactName, phone, email } = parsed.data;

  if (phone) {
    const existingPhone = await prisma.school.findUnique({ where: { phone } });
    if (existingPhone) {
      return { error: "Un compte existe déjà avec ce numéro." };
    }
  }

  const accountEmail = googleLink?.email ?? email ?? null;
  if (accountEmail) {
    const existingEmail = await prisma.school.findUnique({ where: { email: accountEmail } });
    if (existingEmail) {
      return {
        error: googleLink
          ? "Un compte existe déjà avec cette adresse Google. Connectez-vous plutôt."
          : "Un compte existe déjà avec cette adresse e-mail.",
      };
    }
  }

  // Google accounts get an unusable random password: sign-in goes through
  // Google, and no one can guess a value that was never shown to anyone.
  let secret: string;
  if (googleLink) {
    secret = `google:${googleLink.googleId}:${crypto.randomUUID()}`;
  } else {
    const password = PasswordSchema.safeParse(formData.get("password"));
    if (!password.success) {
      return { error: password.error.issues[0]?.message ?? "Mot de passe invalide." };
    }
    secret = password.data;
  }
  const passwordHash = await bcrypt.hash(secret, 10);

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  const school = await prisma.school.create({
    data: {
      name: schoolName,
      city,
      type,
      contactName,
      phone: phone ?? null,
      passwordHash,
      email: accountEmail,
      googleId: googleLink?.googleId ?? null,
      avatarUrl: googleLink?.picture ?? null,
      subscriptionStatus: "trial",
      trialEndsAt,
      academicYears: {
        create: { label: currentAcademicYearLabel(), isCurrent: true },
      },
    },
  });

  if (googleLink) await clearPendingGoogleLink();

  await createSession(school.id);
  redirect("/abonnement");
}

export async function loginAction(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = LoginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { password } = parsed.data;
  const identity = parseIdentifier(parsed.data.identifier);

  // The platform administrator signs in from this same form: a matching Admin
  // record takes precedence over a school with the same number and opens the
  // admin realm instead of the school dashboard. Admin accounts are created
  // out-of-band (npm run admin:create), never through /inscription, and only
  // ever have a phone — an email identifier can never match one.
  if (identity.kind === "phone") {
    const admin = await prisma.admin.findUnique({ where: { phone: identity.phone } });
    if (admin) {
      if (await bcrypt.compare(password, admin.passwordHash)) {
        await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
        await createAdminSession(admin.id);
        redirect("/admin");
      }
      return { error: "Identifiant ou mot de passe incorrect." };
    }
  }

  const school =
    identity.kind === "phone"
      ? await prisma.school.findUnique({ where: { phone: identity.phone } })
      : await prisma.school.findUnique({ where: { email: identity.email } });
  if (!school) {
    return { error: "Identifiant ou mot de passe incorrect." };
  }

  const valid = await bcrypt.compare(password, school.passwordHash);
  if (!valid) {
    return { error: "Identifiant ou mot de passe incorrect." };
  }

  await createSession(school.id);
  redirect("/tableau-de-bord");
}

export async function logoutAction() {
  await deleteSession();
  redirect("/connexion");
}

async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type ForgotPasswordState = { error?: string; ok?: boolean; mockLink?: string } | undefined;

export async function forgotPasswordAction(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const parsed = ForgotPasswordSchema.safeParse({ identifier: formData.get("identifier") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const identity = parseIdentifier(parsed.data.identifier);
  const school =
    identity.kind === "phone"
      ? await prisma.school.findUnique({ where: { phone: identity.phone } })
      : await prisma.school.findUnique({ where: { email: identity.email } });

  // Always report success whether or not an account exists, so this form
  // can't be used to test which numbers or emails are registered.
  if (!school) return { ok: true };

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { schoolId: school.id, tokenHash, expiresAt },
  });

  const origin = await requestOrigin();
  const resetUrl = `${origin}/reinitialiser-mot-de-passe?token=${rawToken}`;

  // WhatsApp isn't used here: a reset link + expiry reads as an authentication
  // flow to Meta's template classifier, which requires the (unavailable, and
  // much more disruptive to adopt — OTP code instead of a link) Authentication
  // template category. E-mail is the only delivery channel for password
  // resets until that's revisited.
  const result = school.email
    ? await sendEmail(
        school.email,
        "Réinitialisation de votre mot de passe Bangre",
        `Bonjour ${school.contactName}, voici votre lien de réinitialisation du mot de passe Bangre (valable 1h) : ${resetUrl}`
      )
    : { ok: false, mode: "mock" as const };

  // The mock link is a dev convenience only: revealing it in production would let
  // anyone type in a registered phone/email and get a live reset link back.
  const showMockLink = result.mode === "mock" && process.env.NODE_ENV !== "production";
  return showMockLink ? { ok: true, mockLink: resetUrl } : { ok: true };
}

export async function resetPasswordAction(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = ResetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { token, password } = parsed.data;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return { error: "Ce lien est invalide ou a expiré. Refaites une demande." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.school.update({ where: { id: resetToken.schoolId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  redirect("/connexion?reset=ok");
}
