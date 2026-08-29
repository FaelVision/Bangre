import { verifySession } from "@/lib/dal";
import { getLateStudents } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { formatAmount } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { LateTable, type LateRow } from "./late-table";
import { SendAllRemindersButton } from "./send-all-button";

export default async function LatePaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; jours?: string }>;
}) {
  const { schoolId } = await verifySession();
  const { classe, jours } = await searchParams;

  const [data, classes] = await Promise.all([
    getLateStudents(schoolId, { classId: classe, minDays: jours ? Number(jours) : undefined }),
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
    overdueLabel: `${r.summary.overdueTranches.map((t) => t.tranche.label).join(" + ")} · ${Math.max(...r.summary.overdueTranches.map((t) => t.daysLate))} j`,
    overdueAmount: r.summary.overdueAmount,
    lastReminder: r.lastReminder ? { sentAt: r.lastReminder.sentAt, status: r.lastReminder.status } : null,
  }));

  const reachableIds = data.rows.filter((r) => r.student.whatsappStatus === "reachable").map((r) => r.student.id);
  const toCallCount = data.rows.length - data.reachableCount;
  const reminderSentCount = data.rows.filter((r) => r.lastReminder).length;

  return (
    <div>
      <PageHeader
        title="Retards de paiement"
        subtitle={`${data.rows.length} élèves · ${formatAmount(data.totalDue)} CFA dus`}
        actions={
          <>
            <a
              href="/api/retards/pdf"
              target="_blank"
              className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline"
            >
              Export PDF
            </a>
            <a
              href="/api/retards/csv"
              target="_blank"
              className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline"
            >
              Export Excel
            </a>
            <SendAllRemindersButton studentIds={reachableIds} />
          </>
        }
      />

      <div className="px-7 pt-4.5 pb-10">
        <form action="/retards" className="flex gap-2.5 items-center mb-3.5 flex-wrap">
          <select name="classe" defaultValue={classe ?? ""} className="h-10 border border-(--color-border-strong) rounded-[10px] bg-white px-3 text-[13.5px] min-w-[150px]">
            <option value="">Classe : toutes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="jours" defaultValue={jours ?? ""} className="h-10 border border-(--color-border-strong) rounded-[10px] bg-white px-3 text-[13.5px] min-w-[170px]">
            <option value="">Retard : tous</option>
            <option value="7">+ de 7 jours</option>
            <option value="15">+ de 15 jours</option>
            <option value="30">+ de 30 jours</option>
          </select>
          <button type="submit" className="h-10 rounded-[10px] border border-(--color-border-strong) bg-white px-4 text-[13.5px] font-semibold cursor-pointer">
            Filtrer
          </button>
          <div className="flex-1" />
          <span className="h-8 rounded-full border border-(--color-success-border) bg-(--color-success-bg-soft) text-(--color-success-text) flex items-center gap-2 px-3.5 text-[12.5px] font-semibold">
            <span className="w-[7px] h-[7px] rounded-full bg-(--color-success-text)" /> Rappel envoyé · {reminderSentCount}
          </span>
          <span className="h-8 rounded-full border border-(--color-danger-border) bg-(--color-danger-bg-soft) text-(--color-danger-text) flex items-center gap-2 px-3.5 text-[12.5px] font-semibold">
            <span className="w-[7px] h-[7px] rounded-full bg-(--color-danger-text)" /> À appeler · {toCallCount}
          </span>
        </form>

        <LateTable rows={rows} />

        <div className="text-[12.5px] text-(--color-text-muted) mt-3">
          Les lignes concernant un parent injoignable sur WhatsApp passent dans la liste d&apos;appels.
        </div>
      </div>
    </div>
  );
}
