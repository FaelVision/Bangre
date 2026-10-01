"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { isMonthKey, monthLabel, monthRange, capitalize } from "@/lib/canteen";
import { canteenPaymentContext, canteenReminderFor } from "@/lib/canteen-overview";
import {
  currentAcademicYear,
  enrollInCanteen,
  leaveCanteen,
  loadCanteenDataset,
  persistCanteenPayment,
  recordCanteenReminder,
  setCanteenSkip,
  changeCanteenStart,
  undoCanteenAction,
  type CanteenPaymentInput,
} from "@/lib/canteen-core";

function revalidateCanteen(studentId?: string) {
  revalidatePath("/cantine");
  if (studentId) revalidatePath(`/eleves/${studentId}`);
}

export async function getCanteenPaymentContextAction(studentId: string) {
  const { schoolId } = await verifySession();
  return canteenPaymentContext(await loadCanteenDataset(schoolId), studentId);
}

export async function recordCanteenPaymentAction(input: CanteenPaymentInput) {
  const { schoolId } = await verifySession();
  const result = await persistCanteenPayment(schoolId, { ...input, offlineCreated: false });
  if (result.ok) revalidateCanteen(input.studentId);
  return result;
}

/** Enrols several students at once, from the same month. */
export async function enrollCanteenAction(studentIds: string[], startMonth: string | null) {
  const { schoolId } = await verifySession();
  let enrolled = 0;
  const errors: string[] = [];
  for (const id of studentIds) {
    const res = await enrollInCanteen(schoolId, id, startMonth);
    if (res.ok) enrolled += 1;
    else if (!errors.includes(res.error)) errors.push(res.error);
  }
  revalidateCanteen();
  for (const id of studentIds) revalidatePath(`/eleves/${id}`);
  return { enrolled, errors };
}

export async function leaveCanteenAction(studentId: string, endMonth: string) {
  const { schoolId } = await verifySession();
  const res = await leaveCanteen(schoolId, studentId, endMonth);
  if (res.ok) revalidateCanteen(studentId);
  return res;
}

/** Marks a month "sans cantine" for a student, or takes the mark off. */
export async function setCanteenSkipAction(studentId: string, month: string, skipped: boolean) {
  const { schoolId } = await verifySession();
  const res = await setCanteenSkip(schoolId, studentId, month, skipped);
  if (res.ok) revalidateCanteen(studentId);
  return res;
}

/** Corrects the first month of a student's current stretch at the canteen. */
export async function changeCanteenStartAction(studentId: string, startMonth: string) {
  const { schoolId } = await verifySession();
  const res = await changeCanteenStart(schoolId, studentId, startMonth);
  if (res.ok) revalidateCanteen(studentId);
  return res;
}

/** Puts things back as before one action of the canteen history — the same day only. */
export async function undoCanteenActionAction(actionId: string, reason?: string) {
  const { schoolId } = await verifySession();
  const res = await undoCanteenAction(schoolId, actionId, reason);
  if (res.ok) revalidateCanteen();
  return res;
}

export async function previewCanteenRemindersAction(studentIds: string[]) {
  const { schoolId } = await verifySession();
  const ds = await loadCanteenDataset(schoolId);
  return studentIds.map((id) => canteenReminderFor(ds, id));
}

export async function confirmCanteenReminderAction(studentId: string, message: string) {
  const { schoolId } = await verifySession();
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true } });
  if (!student) return { ok: false as const, error: "Élève introuvable." };
  const res = await recordCanteenReminder(schoolId, studentId, message);
  revalidateCanteen(studentId);
  return res;
}

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

export type CanteenSettingsState = { error?: string; saved?: boolean } | undefined;

type PackageInput = { label?: unknown; price?: unknown; months?: unknown };

function amount(value: FormDataEntryValue | null) {
  const text = String(value ?? "").replace(/[\s  .]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

export async function saveCanteenSettingsAction(
  _prev: CanteenSettingsState,
  formData: FormData
): Promise<CanteenSettingsState> {
  const { schoolId } = await verifySession();
  const enabled = formData.get("enabled") === "on";

  const year = await currentAcademicYear(schoolId);
  if (!year) return { error: "Aucune année scolaire active." };

  const monthlyPrice = amount(formData.get("monthlyPrice"));
  const annualPrice = amount(formData.get("annualPrice"));
  const firstMonth = String(formData.get("firstMonth") ?? "");
  const lastMonth = String(formData.get("lastMonth") ?? "");
  const dueDay = Number(formData.get("dueDay") ?? 5);

  // Turning the canteen off needs no prices: the settings already saved stay.
  if (!enabled) {
    await prisma.school.update({ where: { id: schoolId }, data: { canteenEnabled: false } });
    revalidatePath("/", "layout");
    return { saved: true };
  }

  if (monthlyPrice == null || Number.isNaN(monthlyPrice) || monthlyPrice <= 0) {
    return { error: "Indiquez le prix mensuel de la cantine." };
  }
  if (annualPrice !== null && (Number.isNaN(annualPrice) || annualPrice <= 0)) {
    return { error: "Le prix annuel doit être un montant positif, ou laissé vide." };
  }
  if (!isMonthKey(firstMonth) || !isMonthKey(lastMonth) || firstMonth > lastMonth) {
    return { error: "Le premier mois de cantine doit précéder le dernier." };
  }
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
    return { error: "Le jour limite de paiement doit être compris entre 1 et 28." };
  }
  const months = new Set(monthRange(firstMonth, lastMonth));

  let rawPackages: PackageInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("packages") ?? "[]"));
    if (Array.isArray(parsed)) rawPackages = parsed;
  } catch {
    return { error: "Forfaits illisibles : rechargez la page." };
  }
  const packages: { label: string; price: number; months: string }[] = [];
  for (const raw of rawPackages) {
    const label = String(raw.label ?? "").trim();
    const price = Number(raw.price);
    const pkgMonths = (Array.isArray(raw.months) ? raw.months : []).map(String).filter(isMonthKey).sort();
    if (!label && !raw.price && pkgMonths.length === 0) continue; // an empty row left in the form
    if (!label) return { error: "Chaque forfait a besoin d'un nom." };
    if (!Number.isInteger(price) || price <= 0) return { error: `Indiquez le prix du forfait « ${label} ».` };
    if (pkgMonths.length < 2) return { error: `Le forfait « ${label} » doit regrouper au moins deux mois.` };
    const outside = pkgMonths.find((m) => !months.has(m));
    if (outside) {
      return { error: `Le forfait « ${label} » comprend ${monthLabel(outside)}, hors de la période de cantine.` };
    }
    packages.push({ label, price, months: [...new Set(pkgMonths)].join(",") });
  }

  // Months already paid must stay inside the period, or they would vanish
  // from the students' files.
  const paidOutside = await prisma.canteenPaymentMonth.findFirst({
    where: {
      payment: { schoolId, academicYearId: year.id, cancelledAt: null },
      OR: [{ month: { lt: firstMonth } }, { month: { gt: lastMonth } }],
    },
    select: { month: true },
  });
  if (paidOutside) {
    return {
      error: `${capitalize(monthLabel(paidOutside.month))} a déjà été payé par une famille : la période doit le comprendre.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    const plan = await tx.canteenPlan.upsert({
      where: { schoolId_academicYearId: { schoolId, academicYearId: year.id } },
      create: { schoolId, academicYearId: year.id, monthlyPrice, annualPrice, firstMonth, lastMonth, dueDay },
      update: { monthlyPrice, annualPrice, firstMonth, lastMonth, dueDay },
    });
    // Packages are only prices: a payment keeps its own label and amounts, so
    // they can be rewritten freely.
    await tx.canteenPackage.deleteMany({ where: { planId: plan.id } });
    if (packages.length) {
      await tx.canteenPackage.createMany({
        data: packages.map((p, order) => ({ planId: plan.id, ...p, order })),
      });
    }
    await tx.school.update({ where: { id: schoolId }, data: { canteenEnabled: true } });
  });

  revalidatePath("/", "layout");
  return { saved: true };
}
