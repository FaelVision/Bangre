"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifyAdmin } from "@/lib/admin-dal";
import { createAdminSession, deleteAdminSession } from "@/lib/admin-session";
import { normalizePhone } from "@/lib/validation";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export type AdminActionState = { error?: string; ok?: string } | undefined;

export async function adminLoginAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const phoneRaw = (formData.get("phone") as string)?.trim();
  const password = (formData.get("password") as string) ?? "";
  if (!phoneRaw || !password) return { error: "Numéro et mot de passe requis." };

  const admin = await prisma.admin.findUnique({ where: { phone: normalizePhone(phoneRaw) } });
  // Compare against a dummy hash when the account is unknown, so a wrong number
  // and a wrong password take the same time to answer.
  const hash = admin?.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
  const valid = await bcrypt.compare(password, hash);
  if (!admin || !valid) return { error: "Identifiants administrateur incorrects." };

  await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  await createAdminSession(admin.id);
  redirect("/admin");
}

export async function adminLogoutAction() {
  await deleteAdminSession();
  redirect("/admin/connexion");
}

export async function setSchoolBlockedAction(schoolId: string, blocked: boolean, reason?: string) {
  await verifyAdmin();
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) return { error: "Établissement introuvable." };

  await prisma.school.update({
    where: { id: schoolId },
    data: {
      blocked,
      blockedReason: blocked ? reason?.trim() || null : null,
      blockedAt: blocked ? new Date() : null,
    },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/ecoles/${schoolId}`);
  return { ok: true };
}

export async function deleteSchoolAction(schoolId: string, confirmName: string) {
  await verifyAdmin();
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true },
  });
  if (!school) return { error: "Établissement introuvable." };

  // Typing the name is the guard: this erases every class, student and payment.
  if (confirmName.trim() !== school.name.trim()) {
    return { error: "Le nom saisi ne correspond pas. Suppression annulée." };
  }

  await prisma.school.delete({ where: { id: schoolId } });

  revalidatePath("/admin");
  return { ok: true };
}

export async function sendAdminMessageAction(schoolId: string, body: string) {
  const admin = await verifyAdmin();
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, phone: true, contactName: true },
  });
  if (!school) return { error: "Établissement introuvable." };

  const text = body.trim();
  if (text.length < 2) return { error: "Le message est vide." };
  if (text.length > 1000) return { error: "Message trop long (1000 caractères maximum)." };

  const result = await sendWhatsAppMessage(school.phone, text);

  await prisma.adminMessage.create({
    data: {
      adminId: admin.id,
      schoolId: school.id,
      channel: "whatsapp",
      toPhone: school.phone,
      body: text,
      status: result.ok ? "sent" : "failed",
    },
  });

  revalidatePath(`/admin/ecoles/${schoolId}`);
  return result.ok
    ? { ok: true, mode: result.mode }
    : { error: result.error ?? "L'envoi a échoué." };
}

export async function resolveErrorAction(errorId: string, resolved: boolean) {
  await verifyAdmin();
  await prisma.errorLog.update({
    where: { id: errorId },
    data: { resolvedAt: resolved ? new Date() : null },
  });
  revalidatePath("/admin/erreurs");
  return { ok: true };
}

export async function deleteErrorAction(errorId: string) {
  await verifyAdmin();
  await prisma.errorLog.delete({ where: { id: errorId } });
  revalidatePath("/admin/erreurs");
  return { ok: true };
}
