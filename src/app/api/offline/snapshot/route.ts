import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decryptSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { currentAcademicYear, planFor } from "@/lib/canteen-core";
import type { SchoolService } from "@/lib/services";
import { loadUniformCatalog } from "@/lib/uniforms-core";

/**
 * The whole school, in one payload: what the device keeps so that every screen
 * still works with no network at all — not just the pages already visited.
 *
 * It is re-downloaded on every reconnection (see `offline-mirror.ts`), so it is
 * a plain full copy rather than an incremental diff: a school's dataset is a
 * few hundred kilobytes, and a full copy can never drift out of sync.
 */

/** Reminders older than this are of no use at the counter — they only feed the "dernier rappel" column. */
const REMINDERS_LIMIT = 2000;

export async function GET(req: NextRequest) {
  const session = await decryptSession(req.cookies.get("bangre_session")?.value);
  if (!session?.schoolId) {
    return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });
  }
  const schoolId = session.schoolId;

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      id: true,
      name: true,
      contactName: true,
      city: true,
      type: true,
      receiptCounter: true,
      subscriptionStatus: true,
      subscriptionRenewsAt: true,
      blocked: true,
      canteenEnabled: true,
      daycareEnabled: true,
      uniformsEnabled: true,
    },
  });
  if (!school) return NextResponse.json({ ok: false, error: "Compte introuvable." }, { status: 401 });
  if (school.blocked) return NextResponse.json({ ok: false, error: "Compte suspendu." }, { status: 403 });

  const [academicYear, classes, students, payments, reminders] = await Promise.all([
    prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } }),
    prisma.schoolClass.findMany({
      where: { schoolId },
      include: { tranches: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    }),
    prisma.student.findMany({
      where: { schoolId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.payment.findMany({
      where: { schoolId },
      include: { allocations: true },
      orderBy: { date: "desc" },
    }),
    prisma.reminder.findMany({
      where: { schoolId },
      orderBy: { sentAt: "desc" },
      take: REMINDERS_LIMIT,
    }),
  ]);

  // The canteen and the garde of the year the device works in — the same year
  // the screens and `/api/sync` use (`currentAcademicYear`), current or latest.
  const canteenYear = academicYear ?? (await currentAcademicYear(schoolId));
  const canteenYearId = canteenYear?.id ?? "";
  const serviceRows = (service: SchoolService) =>
    Promise.all([
      planFor(schoolId, canteenYearId, service),
      prisma.canteenEnrollment.findMany({ where: { schoolId, academicYearId: canteenYearId, service } }),
      prisma.canteenPayment.findMany({
        where: { schoolId, academicYearId: canteenYearId, service },
        include: { months: true },
        orderBy: { date: "desc" },
      }),
      prisma.canteenReminder.findMany({
        where: { schoolId, service },
        orderBy: { sentAt: "desc" },
        take: REMINDERS_LIMIT,
      }),
      prisma.canteenSkip.findMany({ where: { schoolId, academicYearId: canteenYearId, service } }),
    ]).then(([plan, enrollments, payments, reminders, skips]) => ({ plan, enrollments, payments, reminders, skips }));
  const [canteen, daycare, uniformCatalog, uniformSales] = await Promise.all([
    serviceRows("canteen"),
    serviceRows("daycare"),
    loadUniformCatalog(schoolId),
    prisma.uniformSale.findMany({
      where: { schoolId, academicYearId: canteenYearId },
      include: { lines: true },
      orderBy: { date: "desc" },
    }),
  ]);

  return NextResponse.json(
    {
      ok: true,
      syncedAt: new Date().toISOString(),
      school,
      academicYear,
      classes,
      students,
      payments,
      reminders,
      canteen,
      daycare,
      uniforms: { catalog: uniformCatalog, sales: uniformSales },
    },
    // This is the device's private copy of its own data: never store it in a
    // shared cache, and never let the service worker serve a stale one.
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
