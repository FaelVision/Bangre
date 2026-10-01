"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { isMonthKey, monthLabel, monthRange, capitalize } from "@/lib/canteen";
import { parseService, serviceInfo, type SchoolService } from "@/lib/services";
import { canteenPaymentContext, canteenReminderFor } from "@/lib/canteen-overview";
import {
  currentAcademicYear,
  enrollInCanteen,
  planFor,
  leaveCanteen,
  loadCanteenDataset,
  persistCanteenPayment,
  recordCanteenReminder,
  setCanteenSkip,
  changeCanteenStart,
  undoCanteenAction,
  type CanteenPaymentInput,
} from "@/lib/canteen-core";

/**
 * The cantine and the garde d'enfants share these actions: each one says which
 * service it is about, the canteen when it does not.
 */

function revalidateCanteen(service: SchoolService, studentId?: string) {
  revalidatePath(serviceInfo(service).path);
  if (studentId) revalidatePath(`/eleves/${studentId}`);
}

export async function getCanteenPaymentContextAction(studentId: string, service: SchoolService = "canteen") {
  const { schoolId } = await verifySession();
  return canteenPaymentContext(await loadCanteenDataset(schoolId, parseService(service)), studentId);
}

export async function recordCanteenPaymentAction(input: CanteenPaymentInput) {
  const { schoolId } = await verifySession();
  const result = await persistCanteenPayment(schoolId, { ...input, offlineCreated: false });
  if (result.ok) revalidateCanteen(parseService(input.service), input.studentId);
  return result;
}

/** Enrols several students at once, from the same month. */
export async function enrollCanteenAction(
  studentIds: string[],
  startMonth: string | null,
  service: SchoolService = "canteen"
) {
  const { schoolId } = await verifySession();
  const which = parseService(service);
  let enrolled = 0;
  const errors: string[] = [];
  for (const id of studentIds) {
    const res = await enrollInCanteen(schoolId, id, startMonth, which);
    if (res.ok) enrolled += 1;
    else if (!errors.includes(res.error)) errors.push(res.error);
  }
  revalidateCanteen(which);
  for (const id of studentIds) revalidatePath(`/eleves/${id}`);
  return { enrolled, errors };
}

export async function leaveCanteenAction(studentId: string, endMonth: string, service: SchoolService = "canteen") {
  const { schoolId } = await verifySession();
  const which = parseService(service);
  const res = await leaveCanteen(schoolId, studentId, endMonth, which);
  if (res.ok) revalidateCanteen(which, studentId);
  return res;
}

/** Marks a month "sans cantine" (or "sans garde") for a student, or takes the mark off. */
export async function setCanteenSkipAction(
  studentId: string,
  month: string,
  skipped: boolean,
  service: SchoolService = "canteen"
) {
  const { schoolId } = await verifySession();
  const which = parseService(service);
  const res = await setCanteenSkip(schoolId, studentId, month, skipped, { service: which });
  if (res.ok) revalidateCanteen(which, studentId);
  return res;
}

/** Corrects the first month of a student's current stretch in the service. */
export async function changeCanteenStartAction(studentId: string, startMonth: string, service: SchoolService = "canteen") {
  const { schoolId } = await verifySession();
  const which = parseService(service);
  const res = await changeCanteenStart(schoolId, studentId, startMonth, { service: which });
  if (res.ok) revalidateCanteen(which, studentId);
  return res;
}

/** Puts things back as before one action of the canteen history — the same day only. */
export async function undoCanteenActionAction(actionId: string, reason?: string) {
  const { schoolId } = await verifySession();
  const res = await undoCanteenAction(schoolId, actionId, reason);
  if (res.ok) {
    revalidateCanteen("canteen");
    revalidateCanteen("daycare");
  }
  return res;
}

export async function previewCanteenRemindersAction(studentIds: string[], service: SchoolService = "canteen") {
  const { schoolId } = await verifySession();
  const ds = await loadCanteenDataset(schoolId, parseService(service));
  return studentIds.map((id) => canteenReminderFor(ds, id));
}

export async function confirmCanteenReminderAction(studentId: string, message: string, service: SchoolService = "canteen") {
  const { schoolId } = await verifySession();
  const which = parseService(service);
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true } });
  if (!student) return { ok: false as const, error: "Élève introuvable." };
  const res = await recordCanteenReminder(schoolId, studentId, message, which);
  revalidateCanteen(which, studentId);
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
  const service = parseService(formData.get("service"));
  const info = serviceInfo(service);
  const enabledField = service === "daycare" ? "daycareEnabled" : "canteenEnabled";
  const enabled = formData.get("enabled") === "on";

  const year = await currentAcademicYear(schoolId);
  if (!year) return { error: "Aucune année scolaire active." };

  const monthlyPrice = amount(formData.get("monthlyPrice"));
  const annualPrice = amount(formData.get("annualPrice"));
  const firstMonth = String(formData.get("firstMonth") ?? "");
  const lastMonth = String(formData.get("lastMonth") ?? "");
  const dueDay = Number(formData.get("dueDay") ?? 5);

  // Turning the service off needs no prices: the settings already saved stay.
  if (!enabled) {
    await prisma.school.update({ where: { id: schoolId }, data: { [enabledField]: false } });
    revalidatePath("/", "layout");
    return { saved: true };
  }

  if (monthlyPrice == null || Number.isNaN(monthlyPrice) || monthlyPrice <= 0) {
    return { error: `Indiquez le prix mensuel de ${info.the}.` };
  }
  if (annualPrice !== null && (Number.isNaN(annualPrice) || annualPrice <= 0)) {
    return { error: "Le prix annuel doit être un montant positif, ou laissé vide." };
  }
  if (!isMonthKey(firstMonth) || !isMonthKey(lastMonth) || firstMonth > lastMonth) {
    return { error: `Le premier mois de ${info.noun} doit précéder le dernier.` };
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
      return { error: `Le forfait « ${label} » comprend ${monthLabel(outside)}, hors de la période de ${info.noun}.` };
    }
    packages.push({ label, price, months: [...new Set(pkgMonths)].join(",") });
  }

  // Months already paid must stay inside the period, or they would vanish
  // from the students' files.
  const paidOutside = await prisma.canteenPaymentMonth.findFirst({
    where: {
      payment: { schoolId, academicYearId: year.id, service, cancelledAt: null },
      OR: [{ month: { lt: firstMonth } }, { month: { gt: lastMonth } }],
    },
    select: { month: true },
  });
  if (paidOutside) {
    return {
      error: `${capitalize(monthLabel(paidOutside.month))} a déjà été payé par une famille : la période doit le comprendre.`,
    };
  }

  const existing = await planFor(schoolId, year.id, service);
  await prisma.$transaction(async (tx) => {
    // One plan per service and year, kept so here rather than by an index.
    const prices = { monthlyPrice, annualPrice, firstMonth, lastMonth, dueDay };
    const plan = existing
      ? await tx.canteenPlan.update({ where: { id: existing.id }, data: prices })
      : await tx.canteenPlan.create({ data: { schoolId, academicYearId: year.id, service, ...prices } });
    // Packages are only prices: a payment keeps its own label and amounts, so
    // they can be rewritten freely.
    await tx.canteenPackage.deleteMany({ where: { planId: plan.id } });
    if (packages.length) {
      await tx.canteenPackage.createMany({
        data: packages.map((p, order) => ({ planId: plan.id, ...p, order })),
      });
    }
    await tx.school.update({ where: { id: schoolId }, data: { [enabledField]: true } });
  });

  revalidatePath("/", "layout");
  return { saved: true };
}

// ---------------------------------------------------------------------------
// Options de l'établissement
// ---------------------------------------------------------------------------

/**
 * Turns the canteen or the garde on or off for the school. Off hides it from
 * the menu and the encaissements; what was recorded stays for when it is back.
 * Returns whether the year's prices still have to be set.
 */
export async function setServiceEnabledAction(service: SchoolService, enabled: boolean) {
  const { schoolId } = await verifySession();
  const which = parseService(service);
  await prisma.school.update({
    where: { id: schoolId },
    data: { [which === "daycare" ? "daycareEnabled" : "canteenEnabled"]: enabled },
  });
  revalidatePath("/", "layout");
  const year = enabled ? await currentAcademicYear(schoolId) : null;
  const needsPrices = enabled && (!year || !(await planFor(schoolId, year.id, which)));
  return { ok: true as const, needsPrices };
}
