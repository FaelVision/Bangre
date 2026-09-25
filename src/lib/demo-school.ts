import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import {
  buildDemoDataset,
  DEMO_CONTACT_NAME,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_PHONE,
  DEMO_RENEWAL_DATE,
  DEMO_SCHOOL_NAME,
  DEFAULT_REMINDER_TEMPLATE,
  newDemoId,
} from "@/lib/demo-dataset";

export * from "@/lib/demo-dataset";

/**
 * Writing the demonstration school down.
 *
 * It is *not* the dev seed (`prisma/seed.ts`), which empties the whole database
 * and exists only for local development. This one replaces a single school —
 * the one holding the demo e-mail — so it is safe to run against production.
 *
 * No `server-only` guard on purpose: the same code runs from the admin panel
 * and from `npm run demo:reset` on a plain Node process.
 */

export type DemoResetResult = {
  schoolId: string;
  classes: number;
  students: number;
  payments: number;
  email: string;
  phone: string;
  password: string;
};

/**
 * Rebuilds the demo school from nothing. Only the account holding the demo
 * e-mail or phone number is removed — every other school in the database is
 * untouched, which is what makes this safe to run in production.
 */
export async function resetDemoSchool(now: Date = new Date()): Promise<DemoResetResult> {
  const dataset = buildDemoDataset(now);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Cascades take the classes, students, payments and reminders with it.
  await prisma.school.deleteMany({ where: { OR: [{ email: DEMO_EMAIL }, { phone: DEMO_PHONE }] } });

  const schoolId = newDemoId();
  const academicYearId = newDemoId();

  await prisma.$transaction([
    prisma.school.create({
      data: {
        id: schoolId,
        name: DEMO_SCHOOL_NAME,
        city: "Ouagadougou",
        type: "Primaire et Collège",
        contactName: DEMO_CONTACT_NAME,
        phone: DEMO_PHONE,
        email: DEMO_EMAIL,
        passwordHash,
        // Never expires: a locked account in front of a prospect is the one
        // thing this account must never do.
        subscriptionStatus: "active",
        subscriptionRenewsAt: DEMO_RENEWAL_DATE,
        receiptCounter: dataset.payments.length,
      },
    }),
    prisma.academicYear.create({
      data: { id: academicYearId, schoolId, label: dataset.academicYearLabel, isCurrent: true },
    }),
    prisma.schoolClass.createMany({
      data: dataset.classes.map((c) => ({
        ...c,
        schoolId,
        academicYearId,
        reminderEnabled: true,
        reminderBeforeDays: 7,
        reminderAfterDays: "3,10",
        reminderHour: "08:00",
        reminderMessageTemplate: DEFAULT_REMINDER_TEMPLATE,
      })),
    }),
    prisma.tranche.createMany({ data: dataset.tranches }),
    prisma.student.createMany({ data: dataset.students.map((s) => ({ ...s, schoolId, status: "active" })) }),
    prisma.payment.createMany({
      data: dataset.payments.map((p) => ({ ...p, schoolId, offlineCreated: false, synced: true })),
    }),
    prisma.paymentAllocation.createMany({ data: dataset.allocations }),
    prisma.reminder.createMany({
      data: dataset.reminders.map((r) => ({
        ...r,
        schoolId,
        channel: "whatsapp",
        trigger: "auto_after",
        status: "sent",
      })),
    }),
  ]);

  return {
    schoolId,
    classes: dataset.classes.length,
    students: dataset.students.length,
    payments: dataset.payments.length,
    email: DEMO_EMAIL,
    phone: DEMO_PHONE,
    password: DEMO_PASSWORD,
  };
}

export type DemoSchoolSummary = {
  exists: boolean;
  schoolId?: string;
  name?: string;
  createdAt?: Date;
  students?: number;
  payments?: number;
};

/** What the admin panel shows about the demo account before touching anything. */
export async function getDemoSchoolSummary(): Promise<DemoSchoolSummary> {
  const school = await prisma.school.findFirst({
    where: { email: DEMO_EMAIL },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { students: true, payments: true } },
    },
  });
  if (!school) return { exists: false };

  return {
    exists: true,
    schoolId: school.id,
    name: school.name,
    createdAt: school.createdAt,
    students: school._count.students,
    payments: school._count.payments,
  };
}
