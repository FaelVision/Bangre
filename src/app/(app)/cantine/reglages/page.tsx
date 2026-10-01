import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { currentAcademicYear } from "@/lib/canteen-core";
import { addMonths, defaultCanteenPeriod, packageMonths, schoolYearMonths } from "@/lib/canteen";
import { CanteenSettingsForm, type CanteenSettingsValues } from "./settings-form";

export default async function CanteenSettingsPage() {
  const { schoolId } = await verifySession();
  const [school, year] = await Promise.all([
    prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { canteenEnabled: true } }),
    currentAcademicYear(schoolId),
  ]);

  const plan = year
    ? await prisma.canteenPlan.findUnique({
        where: { schoolId_academicYearId: { schoolId, academicYearId: year.id } },
        include: { packages: { orderBy: { order: "asc" } } },
      })
    : null;

  let values: CanteenSettingsValues;
  if (plan) {
    values = {
      monthlyPrice: String(plan.monthlyPrice),
      annualPrice: plan.annualPrice ? String(plan.annualPrice) : "",
      firstMonth: plan.firstMonth,
      lastMonth: plan.lastMonth,
      dueDay: String(plan.dueDay),
      packages: plan.packages.map((p) => ({ label: p.label, price: String(p.price), months: packageMonths(p) })),
    };
  } else {
    // A new year starts from last year's prices and packages, moved forward by
    // the number of years in between; a school's first year from October–June.
    const previous = await prisma.canteenPlan.findFirst({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
      include: { packages: { orderBy: { order: "asc" } } },
    });
    const period = defaultCanteenPeriod(year?.label);
    const shift = previous ? (Number(period.firstMonth.slice(0, 4)) - Number(previous.firstMonth.slice(0, 4))) * 12 : 0;
    values = previous
      ? {
          monthlyPrice: String(previous.monthlyPrice),
          annualPrice: previous.annualPrice ? String(previous.annualPrice) : "",
          firstMonth: addMonths(previous.firstMonth, shift),
          lastMonth: addMonths(previous.lastMonth, shift),
          dueDay: String(previous.dueDay),
          packages: previous.packages.map((p) => ({
            label: p.label,
            price: String(p.price),
            months: packageMonths(p).map((m) => addMonths(m, shift)),
          })),
        }
      : { monthlyPrice: "", annualPrice: "", ...period, dueDay: "5", packages: [] };
  }

  return (
    <CanteenSettingsForm
      enabled={school.canteenEnabled}
      hasPlan={plan != null}
      yearLabel={year?.label ?? ""}
      yearMonths={schoolYearMonths(year?.label)}
      initial={values}
    />
  );
}
