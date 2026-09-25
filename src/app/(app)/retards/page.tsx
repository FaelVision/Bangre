import { verifySession } from "@/lib/dal";
import { getLateStudents } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { LateView } from "@/components/views/late-view";
import type { LateRow } from "@/components/late-table";

export default async function LatePaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; jours?: string; whatsapp?: string }>;
}) {
  const { schoolId } = await verifySession();
  const { classe, jours, whatsapp } = await searchParams;
  const whatsappFilter = whatsapp === "injoignable" || whatsapp === "reachable" ? whatsapp : undefined;

  const [data, classes] = await Promise.all([
    getLateStudents(schoolId, {
      classId: classe,
      minDays: jours ? Number(jours) : undefined,
      whatsapp: whatsappFilter,
    }),
    prisma.schoolClass.findMany({ where: { schoolId, archived: false }, orderBy: { order: "asc" } }),
  ]);

  const rows: LateRow[] = data.rows.map((r) => ({
    id: r.student.id,
    lastName: r.student.lastName,
    firstName: r.student.firstName,
    className: r.student.class.name,
    parentName: r.student.parentName,
    parentPhone: r.student.parentPhone,
    whatsappStatus: r.student.whatsappStatus,
    overdueLabel: `${r.summary.overdueTranches.map((t) => t.tranche.label).join(" + ")} · ${Math.max(
      ...r.summary.overdueTranches.map((t) => t.daysLate)
    )} j`,
    overdueAmount: r.summary.overdueAmount,
    lastReminder: r.lastReminder ? { sentAt: r.lastReminder.sentAt, status: r.lastReminder.status } : null,
  }));

  const reachableStudents = data.rows
    .filter((r) => r.student.whatsappStatus === "reachable")
    .map((r) => ({ id: r.student.id, label: `${r.student.lastName} ${r.student.firstName}` }));

  return (
    <LateView
      rows={rows}
      classes={classes.map((c) => ({ id: c.id, name: c.name }))}
      filters={{ classe, jours, whatsapp }}
      reachableStudents={reachableStudents}
      reachableCount={data.reachableCount}
      totalDue={data.totalDue}
    />
  );
}
