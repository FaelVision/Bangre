import { capitalize, describeMonths, monthLabel } from "@/lib/canteen";
import type { CanteenStudentCard } from "@/lib/canteen-overview";
import { formatAmount } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import { MonthChips } from "@/components/canteen/month-chips";
import { CanteenPayButton } from "@/components/canteen/canteen-pay-button";
import { CanteenEnrollButton, CanteenLeaveButton } from "@/components/canteen/canteen-enrollment";
import { CanteenMonthsButton } from "@/components/canteen/canteen-months-button";
import { serviceInfo } from "@/lib/services";

/** The canteen (or the garde) on a student file — shown only when the school runs it. */
export function StudentCanteenCard({
  card,
  student,
}: {
  card: CanteenStudentCard;
  student: { id: string; label: string };
}) {
  const summary = card.summary;
  const service = card.service;
  const info = serviceInfo(service);
  const owesSomething = summary ? summary.paidCount < summary.billableCount : false;

  return (
    <Card>
      <div className="flex items-center gap-2">
        <div className="text-[15px] font-semibold">{info.title}</div>
        <div className="flex-1" />
        {card.enrolled ? (
          summary?.status === "retard" ? (
            <Badge tone="danger">En retard</Badge>
          ) : (
            <Badge tone="success">Inscrit(e)</Badge>
          )
        ) : (
          <Badge tone="neutral">{summary ? "Sorti(e)" : "Non inscrit(e)"}</Badge>
        )}
      </div>

      {summary ? (
        <>
          <div className="text-[12.5px] text-(--color-text-muted) mt-1.5">
            {card.enrolled && card.startMonth ? `Depuis ${monthLabel(card.startMonth)} · ` : ""}
            {formatAmount(card.monthlyPrice)} CFA / mois · {summary.paidCount}/{summary.billableCount} mois payés
            {summary.billableCount < summary.months.length
              ? ` · ${summary.months.length - summary.billableCount} ${info.without}`
              : ""}
          </div>
          <MonthChips service={service} months={summary.months} className="mt-3" />
          {summary.lateMonths.length > 0 && (
            <div className="text-[12.5px] text-(--color-danger-text) mt-2.5">
              {capitalize(describeMonths(summary.lateMonths))} en retard · {formatAmount(summary.lateAmount)} CFA
            </div>
          )}
        </>
      ) : (
        <p className="text-[12.5px] text-(--color-text-muted) mt-1.5 leading-relaxed">
          {service === "daycare" ? "Cet élève n'est pas gardé par l'école." : "Cet élève ne prend pas la cantine."}{" "}
          Inscrivez-le pour suivre ses paiements de {info.noun} ({formatAmount(card.monthlyPrice)} CFA / mois).
        </p>
      )}

      <div className="flex gap-2 flex-wrap mt-3.5">
        {owesSomething && (
          <CanteenPayButton
            service={service}
            studentId={student.id}
            className="h-[36px] rounded-[9px] bg-(--color-primary) text-white px-3.5 text-[13px] font-semibold"
          >
            Payer {info.the}
          </CanteenPayButton>
        )}
        {summary && (
          <CanteenMonthsButton
            service={service}
            student={student}
            months={summary.months}
            enrollment={
              card.enrolled && card.startMonth
                ? { startMonth: card.startMonth, firstMonth: card.firstMonth, lastMonth: card.lastMonth }
                : null
            }
            className="h-[36px] rounded-[9px] px-3.5 text-[13px]"
          >
            Mois de {info.noun}
          </CanteenMonthsButton>
        )}
        {card.enrolled && card.startMonth ? (
          <CanteenLeaveButton
            service={service}
            student={student}
            startMonth={card.startMonth}
            lastMonth={card.lastMonth}
            currentMonth={card.currentMonth}
            className="h-[36px] rounded-[9px] px-3.5 text-[13px]"
          />
        ) : (
          card.candidates.length > 0 && (
            <CanteenEnrollButton
              service={service}
              candidates={card.candidates}
              preselect={[student.id]}
              firstMonth={card.firstMonth}
              lastMonth={card.lastMonth}
              currentMonth={card.currentMonth}
              className="h-[36px] rounded-[9px] border border-(--color-border-strong) bg-white px-3.5 text-[13px] font-semibold"
            >
              {summary ? `Réinscrire à ${info.the}` : `Inscrire à ${info.the}`}
            </CanteenEnrollButton>
          )
        )}
      </div>
    </Card>
  );
}
