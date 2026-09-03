import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * WhatsApp Cloud API webhook.
 *
 * GET  — the one-time verification handshake Meta does when you register the URL
 *        (echo `hub.challenge` when `hub.verify_token` matches ours).
 * POST — delivery events. We map `statuses[].id` back to the reminder we stored
 *        under `providerMessageId` and move it through sent → delivered → read,
 *        or to failed. Anything we don't recognise is acknowledged and ignored
 *        (Meta retries on any non-200).
 */

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 3 };

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (
    verifyToken &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === verifyToken
  ) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // ack malformed, don't make Meta retry
  }

  const statuses: { id?: string; status?: string }[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of (entry as { changes?: unknown[] })?.changes ?? []) {
      for (const s of ((change as { value?: { statuses?: unknown[] } })?.value?.statuses ?? []) as {
        id?: string;
        status?: string;
      }[]) {
        if (s?.id && s?.status) statuses.push(s);
      }
    }
  }

  for (const s of statuses) {
    const reminder = await prisma.reminder.findFirst({
      where: { providerMessageId: s.id },
      select: { id: true, status: true },
    });
    if (!reminder) continue;
    const next = s.status!;
    // Never move backwards (a late "sent" after a "read").
    if ((STATUS_RANK[next] ?? 0) <= (STATUS_RANK[reminder.status] ?? 0) && next !== "failed") continue;
    await prisma.reminder.update({ where: { id: reminder.id }, data: { status: next } });
  }

  return NextResponse.json({ ok: true, processed: statuses.length });
}
