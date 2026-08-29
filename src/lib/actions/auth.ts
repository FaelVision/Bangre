"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { LoginSchema, SignupSchema } from "@/lib/validation";

export type AuthActionState = { error?: string } | undefined;

function currentAcademicYearLabel(now = new Date()) {
  // School year runs roughly Oct -> Jun; before October we're still in
  // the year that started the previous autumn.
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${year + 1}`;
}

export async function signupAction(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = SignupSchema.safeParse({
    schoolName: formData.get("schoolName"),
    city: formData.get("city"),
    type: formData.get("type"),
    contactName: formData.get("contactName"),
    phone: formData.get("phone"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { schoolName, city, type, contactName, phone, password } = parsed.data;

  const existing = await prisma.school.findUnique({ where: { phone } });
  if (existing) {
    return { error: "Un compte existe déjà avec ce numéro." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
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
      subscriptionStatus: "trial",
      trialEndsAt,
      academicYears: {
        create: { label: currentAcademicYearLabel(), isCurrent: true },
      },
    },
  });

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
