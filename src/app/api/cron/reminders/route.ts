import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasCurrentSubscription } from "@/lib/dal";
import { runSchoolReminders, type SchoolReminderRun } from "@/lib/reminders-core";

/**
 * Hourly entry point for the automatic WhatsApp reminders.
 *
 * Call it once an hour from an external scheduler (Render Cron Job, GitHub
 * Actions, cron-job.org…):
 *
 *   curl -X POST https://<host>/api/cron/reminders \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Each class only sends at its own configured hour, so running more often than
 * hourly is harmless but pointless. Everything is idempotent: a given
 * (student, tranche, trigger) reminder is sent once.
 */

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET n'est pas configuré sur le serveur." },
      { status: 503 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }

  const now = new Date();
  const schools = await prisma.school.findMany({
    where: { blocked: false },
    select: {
      id: true,
      name: true,
      subscriptionStatus: true,
      subscriptionRenewsAt: true,
      trialEndsAt: true,
    },
  });

  const runs: (SchoolReminderRun & { error?: true })[] = [];
  for (const school of schools) {
    const trialValid = school.trialEndsAt ? school.trialEndsAt.getTime() > now.getTime() : false;
    if (!hasCurrentSubscription(school) && !trialValid) continue;
    try {
      runs.push(await runSchoolReminders(school, now));
    } catch (err) {
      console.error(`[cron:reminders] école ${school.id} :`, err);
      runs.push({ schoolId: school.id, considered: 0, sent: 0, failed: 0, error: true });
    }
  }

  const totals = runs.reduce(
    (acc, r) => ({
      schools: acc.schools + 1,
      sent: acc.sent + r.sent,
      failed: acc.failed + r.failed,
    }),
    { schools: 0, sent: 0, failed: 0 }
  );

  return NextResponse.json({ ok: true, at: now.toISOString(), totals, runs });
}

export const POST = handle;
export const GET = handle;
