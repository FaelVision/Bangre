"use client";

import {
  cancelUniformSaleAction,
  getUniformSaleContextAction,
  recordUniformSaleAction,
  setUniformDeliveredAction,
} from "@/lib/actions/uniforms";
import { quoteUniformSale, uniformConfirmationMessage } from "@/lib/uniforms";
import { uniformSaleContext, type UniformSaleContext } from "@/lib/uniforms-overview";
import { isLocalId, uniformDataset } from "@/lib/offline-data";
import { loadLocalData, scheduleSnapshotRefresh } from "@/lib/offline-mirror";
import { enqueue, queueId, type UniformSalePayload } from "@/lib/offline-queue";
import { isNetworkError, isOffline, withNetwork } from "@/lib/connectivity";
import { buildWhatsAppLink } from "@/lib/whatsapp-link";

/**
 * Les tenues, online or not. A sale tries the server first; without a network
 * it goes to the device outbox and the local copy shows it at once.
 */

function deviceOnly(studentId?: string) {
  return isOffline() || (studentId ? isLocalId(studentId) : false);
}

export async function loadUniformSaleContext(
  studentId: string
): Promise<{ context: UniformSaleContext; local: boolean } | { error: string }> {
  if (!deviceOnly(studentId)) {
    try {
      const res = await withNetwork(() => getUniformSaleContextAction(studentId), 8000);
      return "error" in res ? res : { context: res, local: false };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  const data = await loadLocalData();
  if (!data) return { error: "Aucune donnée sur cet appareil : connectez-vous une fois au réseau." };
  const res = uniformSaleContext(uniformDataset(data), studentId);
  return "error" in res ? res : { context: res, local: true };
}

export type UniformSaleOutcome =
  | { ok: true; saleId: string; receiptNumber: number; amount: number; whatsappUrl: string | null }
  | { ok: true; queued: true; amount: number; whatsappUrl: string | null }
  | { ok: false; error: string };

export async function submitUniformSale(
  payload: UniformSalePayload,
  preview: { amount: number; studentName: string }
): Promise<UniformSaleOutcome> {
  const ref = queueId();
  if (!deviceOnly(payload.studentId)) {
    try {
      const res = await withNetwork(() => recordUniformSaleAction({ ...payload, clientRef: `sync:${ref}` }), 15000);
      if (res.ok) scheduleSnapshotRefresh();
      return res;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  await enqueue(
    { kind: "uniform.sale", payload },
    `Tenues ${preview.amount.toLocaleString("fr-FR")} CFA · ${preview.studentName}`,
    ref
  );
  return {
    ok: true,
    queued: true,
    amount: preview.amount,
    whatsappUrl: payload.notifyWhatsapp ? await localConfirmationLink(payload).catch(() => null) : null,
  };
}

async function localConfirmationLink(payload: UniformSalePayload) {
  const data = await loadLocalData();
  const student = data?.students.find((s) => s.id === payload.studentId);
  const clazz = data?.classes.find((c) => c.id === student?.classId);
  if (!data || !student?.parentPhone) return null;
  const quote = quoteUniformSale(data.uniforms.catalog, payload.cart, clazz?.level, { ignoreStock: true });
  if (!quote.ok) return null;
  return buildWhatsAppLink(
    student.parentPhone,
    uniformConfirmationMessage({
      amount: quote.amount,
      lines: quote.lines,
      studentFirstName: student.firstName,
      studentLastName: student.lastName,
      className: clazz?.name ?? "",
      date: payload.date ? new Date(payload.date) : new Date(),
      schoolName: data.school.name,
      receiptNumber: null,
      delivered: payload.delivered,
    })
  );
}

/** Marks tenues handed over (or not); offline, it waits in the outbox. */
export async function setUniformDelivered(
  lineIds: string[],
  delivered: boolean,
  label: string
): Promise<{ ok: true; queued: boolean } | { ok: false; error: string }> {
  if (!isOffline()) {
    try {
      const res = await withNetwork(() => setUniformDeliveredAction(lineIds, delivered), 10000);
      if (res.ok) scheduleSnapshotRefresh();
      return res.ok ? { ok: true, queued: false } : res;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  await enqueue({ kind: "uniform.deliver", lineIds, delivered }, `${delivered ? "Remise" : "Remise annulée"} · ${label}`);
  return { ok: true, queued: true };
}

const NEEDS_NETWORK = "Pas de connexion : l'annulation se fait en ligne. Réessayez au retour du réseau.";

/** Cancels a sale the day it was made. Online only: the stock is restored on the server. */
export async function cancelUniformSale(saleId: string, reason?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isOffline()) return { ok: false, error: NEEDS_NETWORK };
  try {
    const res = await withNetwork(() => cancelUniformSaleAction(saleId, reason), 15000);
    if (res.ok) scheduleSnapshotRefresh();
    return res;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    return { ok: false, error: NEEDS_NETWORK };
  }
}
