"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, deleteSession, readPendingGoogleLink, clearPendingGoogleLink } from "@/lib/session";
import { createAdminSession } from "@/lib/admin-session";
import { LoginSchema, SchoolDetailsSchema, PasswordSchema } from "@/lib/validation";
import { currentAcademicYearLabel } from "@/lib/promotion";

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
  };

  const parsed = SchoolDetailsSchema.safeParse(fields);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { schoolName, city, type, contactName, phone } = parsed.data;

  const existing = await prisma.school.findUnique({ where: { phone } });
  if (existing) {
    return { error: "Un compte existe déjà avec ce numéro." };
  }

  if (googleLink) {
    const emailTaken = await prisma.school.findUnique({ where: { email: googleLink.email } });
    if (emailTaken) {
      return { error: "Un compte existe déjà avec cette adresse Google. Connectez-vous plutôt." };
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
      phone,
      passwordHash,
      email: googleLink?.email ?? null,
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
    phone: formData.get("phone"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { phone, password } = parsed.data;

  // The platform administrator signs in from this same form: a matching Admin
  // record takes precedence over a school with the same number and opens the
  // admin realm instead of the school dashboard. Admin accounts are created
  // out-of-band (npm run admin:create), never through /inscription.
  const admin = await prisma.admin.findUnique({ where: { phone } });
  if (admin) {
    if (await bcrypt.compare(password, admin.passwordHash)) {
      await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
      await createAdminSession(admin.id);
      redirect("/admin");
    }
    return { error: "Numéro ou mot de passe incorrect." };
  }

  const school = await prisma.school.findUnique({ where: { phone } });
  if (!school) {
    return { error: "Numéro ou mot de passe incorrect." };
  }

  const valid = await bcrypt.compare(password, school.passwordHash);
  if (!valid) {
    return { error: "Numéro ou mot de passe incorrect." };
  }

  await createSession(school.id);
  redirect("/tableau-de-bord");
}

export async function logoutAction() {
  await deleteSession();
  redirect("/connexion");
}
