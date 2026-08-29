import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Kept in sync with DEFAULT_REMINDER_TEMPLATE in src/lib/whatsapp.ts.
// (Not imported directly: that module carries a `server-only` guard that
// throws outside of the Next.js server compilation, which this plain
// tsx-run seed script isn't part of.)
const DEFAULT_REMINDER_TEMPLATE =
  "Bonjour {parent}, la {tranche} de la scolarité de {eleve} ({classe}), d'un montant de {montant} CFA, est attendue le {echeance}. Merci. — {ecole}";

const prisma = new PrismaClient();

// Deterministic PRNG so reseeding gives a stable, reproducible dataset.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260827);
const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
const int = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;

const SURNAMES = [
  "SAWADOGO", "KABORÉ", "TRAORÉ", "OUÉDRAOGO", "ZONGO", "COMPAORÉ", "DIALLO",
  "SANOU", "BAMBARA", "YAMEOGO", "KIENTEGA", "TAPSOBA", "NIKIEMA", "OUATTARA",
  "BATIONO", "KONE", "ILBOUDO", "KABRÉ", "SOME", "BELEM",
];
const FIRST_NAMES_F = [
  "Aminata", "Fatimata", "Mariam", "Aïcha", "Awa", "Noélie", "Fatou",
  "Aïssata", "Safiatou", "Rachidatou", "Salamata", "Hawa", "Djénéba",
];
const FIRST_NAMES_M = [
  "Issouf", "Salif", "Boukary", "Rasmané", "Paul", "Adama", "Karim",
  "Hamed", "Moussa", "Boubacar", "Idrissa", "Seydou", "Yacouba",
];

type ClassPlan = {
  name: string;
  level: "Primaire" | "Collège" | "Lycée";
  order: number;
  studentCount: number;
  tuitionAmount: number | null;
  registrationFee: number | null;
};

const CLASS_PLAN: ClassPlan[] = [
  { name: "CP1", level: "Primaire", order: 1, studentCount: 28, tuitionAmount: 90000, registrationFee: 8000 },
  { name: "CP2", level: "Primaire", order: 2, studentCount: 26, tuitionAmount: 90000, registrationFee: 8000 },
  { name: "CE1", level: "Primaire", order: 3, studentCount: 30, tuitionAmount: 95000, registrationFee: 8000 },
  { name: "CE2", level: "Primaire", order: 4, studentCount: 27, tuitionAmount: 95000, registrationFee: 8000 },
  { name: "CM1", level: "Primaire", order: 5, studentCount: 29, tuitionAmount: 105000, registrationFee: 9000 },
  { name: "CM2", level: "Primaire", order: 6, studentCount: 31, tuitionAmount: 110000, registrationFee: 9000 },
  { name: "6e A", level: "Collège", order: 7, studentCount: 34, tuitionAmount: 150000, registrationFee: 10000 },
  { name: "6e B", level: "Collège", order: 8, studentCount: 32, tuitionAmount: 150000, registrationFee: 10000 },
  { name: "5e B", level: "Collège", order: 9, studentCount: 30, tuitionAmount: 150000, registrationFee: 10000 },
  { name: "4e A", level: "Collège", order: 10, studentCount: 29, tuitionAmount: 155000, registrationFee: 10000 },
  { name: "3e A", level: "Collège", order: 11, studentCount: 27, tuitionAmount: 160000, registrationFee: 10000 },
  { name: "2nde C", level: "Lycée", order: 12, studentCount: 22, tuitionAmount: null, registrationFee: null },
  { name: "1ère D", level: "Lycée", order: 13, studentCount: 20, tuitionAmount: null, registrationFee: null },
  { name: "Tle D", level: "Lycée", order: 14, studentCount: 19, tuitionAmount: 190000, registrationFee: 12000 },
];

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  console.log("Seeding database…");
  await prisma.$transaction([
    prisma.syncLogEntry.deleteMany(),
    prisma.promotionDecision.deleteMany(),
    prisma.reminder.deleteMany(),
    prisma.paymentAllocation.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.subscriptionPayment.deleteMany(),
    prisma.student.deleteMany(),
    prisma.tranche.deleteMany(),
    prisma.schoolClass.deleteMany(),
    prisma.academicYear.deleteMany(),
    prisma.school.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash("password123", 10);
  const school = await prisma.school.create({
    data: {
      name: "Lycée municipal de Ouagadougou",
      city: "Ouagadougou",
      type: "Secondaire",
      contactName: "S. Ouédraogo",
      phone: "+22670112233",
      email: "secretariat@lycee-municipal-ouaga.bf",
      passwordHash,
      subscriptionStatus: "active",
      subscriptionRenewsAt: addDays(new Date(), 30),
      receiptCounter: 0,
    },
  });

  const academicYear = await prisma.academicYear.create({
    data: { schoolId: school.id, label: "2026-2027", isCurrent: true },
  });

  const now = new Date();
  const tranche1Due = addDays(now, -60);
  const tranche2Due = addDays(now, -10);
  const tranche3Due = addDays(now, 45);

  let matriculeCounter = 451;
  let receiptCounter = 0;

  for (const plan of CLASS_PLAN) {
    const schoolClass = await prisma.schoolClass.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        name: plan.name,
        level: plan.level,
        order: plan.order,
        tuitionAmount: plan.tuitionAmount,
        registrationFee: plan.registrationFee,
        reminderEnabled: true,
        reminderBeforeDays: 7,
        reminderAfterDays: "3,10",
        reminderHour: "08:00",
        reminderMessageTemplate: DEFAULT_REMINDER_TEMPLATE,
      },
    });

    let tranches: { id: string; label: string; amount: number; order: number; dueDate: Date }[] = [];
    if (plan.tuitionAmount) {
      const t1amount = Math.round(plan.tuitionAmount * 0.4);
      const t2amount = Math.round(plan.tuitionAmount * 0.33);
      const t3amount = plan.tuitionAmount - t1amount - t2amount;
      const created = await Promise.all([
        prisma.tranche.create({
          data: { classId: schoolClass.id, label: "1re tranche", amount: t1amount, dueType: "date", dueDate: tranche1Due, order: 1 },
        }),
        prisma.tranche.create({
          data: { classId: schoolClass.id, label: "2e tranche", amount: t2amount, dueType: "end_of_term", dueDate: tranche2Due, order: 2 },
        }),
        prisma.tranche.create({
          data: { classId: schoolClass.id, label: "3e tranche", amount: t3amount, dueType: "end_of_term", dueDate: tranche3Due, order: 3 },
        }),
      ]);
      tranches = created;
    }

    for (let i = 0; i < plan.studentCount; i++) {
      const isFemale = rng() > 0.5;
      const firstName = pick(isFemale ? FIRST_NAMES_F : FIRST_NAMES_M);
      const lastName = pick(SURNAMES);
      matriculeCounter += 1;
      const matricule = `BG-${matriculeCounter}`;
      const ageYears = plan.order <= 6 ? 6 + plan.order : plan.order <= 11 ? 11 + (plan.order - 6) : 15 + (plan.order - 11);
      const birthDate = new Date(now.getFullYear() - ageYears, int(0, 11), int(1, 28));

      const hasPhone = rng() > 0.08;
      const whatsappRoll = rng();
      const whatsappStatus = !hasPhone ? "invalid" : whatsappRoll > 0.8 ? "unreachable" : "reachable";

      const student = await prisma.student.create({
        data: {
          schoolId: school.id,
          classId: schoolClass.id,
          matricule,
          lastName,
          firstName,
          birthDate,
          gender: isFemale ? "F" : "M",
          parentName: `${isFemale ? "Mme" : "M."} ${lastName} ${pick(FIRST_NAMES_M).charAt(0)}.`,
          parentPhone: hasPhone ? `+226 ${int(60, 79)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}` : null,
          whatsappStatus,
        },
      });

      if (!tranches.length) continue;

      const roll = rng();
      const payments: { tranches: typeof tranches; date: Date; portionOfT2?: number; portionOfT1?: number }[] = [];

      if (roll < 0.65) {
        // Paid everything, including the not-yet-due tranche.
        payments.push({ tranches: [tranches[0]], date: addDays(tranches[0].dueDate, -int(1, 10)) });
        payments.push({ tranches: [tranches[1]], date: addDays(tranches[1].dueDate, -int(1, 8)) });
        payments.push({ tranches: [tranches[2]], date: addDays(now, -int(0, 5)) });
      } else if (roll < 0.85) {
        // Tranche 1 paid, tranche 2 partially paid (overdue remainder).
        payments.push({ tranches: [tranches[0]], date: addDays(tranches[0].dueDate, -int(1, 10)) });
        payments.push({ tranches: [tranches[1]], date: addDays(now, -int(1, 8)), portionOfT2: 0.3 + rng() * 0.5 });
      } else if (roll < 0.95) {
        // Nothing paid yet — fully overdue.
      } else {
        // Tranche 1 and 2 paid, tranche 3 not due yet.
        payments.push({ tranches: [tranches[0]], date: addDays(tranches[0].dueDate, -int(1, 10)) });
        payments.push({ tranches: [tranches[1]], date: addDays(tranches[1].dueDate, -int(1, 5)) });
      }

      for (const p of payments) {
        const tranche = p.tranches[0];
        const amount = p.portionOfT2
          ? Math.round(tranche.amount * p.portionOfT2)
          : tranche.amount;
        receiptCounter += 1;
        await prisma.payment.create({
          data: {
            schoolId: school.id,
            studentId: student.id,
            amount,
            method: "cash",
            receivedBy: "S. Ouédraogo",
            date: p.date,
            receiptNumber: receiptCounter,
            offlineCreated: false,
            synced: true,
            allocations: {
              create: [{ trancheId: tranche.id, amount }],
            },
          },
        });
      }

      if (payments.length && whatsappStatus === "reachable" && rng() > 0.4) {
        await prisma.reminder.create({
          data: {
            schoolId: school.id,
            studentId: student.id,
            channel: "whatsapp",
            trigger: "auto_after",
            status: rng() > 0.5 ? "read" : "sent",
            message: `Rappel de paiement pour ${firstName} ${lastName} (${plan.name}).`,
            sentAt: addDays(now, -int(1, 15)),
          },
        });
      }
    }

    console.log(`  · ${plan.name}: ${plan.studentCount} élèves`);
  }

  await prisma.school.update({ where: { id: school.id }, data: { receiptCounter } });

  console.log("\nDone. Login with:");
  console.log("  Téléphone : +226 70 11 22 33");
  console.log("  Mot de passe : password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
