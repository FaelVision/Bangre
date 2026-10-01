import type { UniformStudentCard } from "@/lib/uniforms-overview";
import { formatAmount, formatDate } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import { UniformSaleButton } from "@/components/uniforms/uniform-sale-button";
import { UniformDeliverButton } from "@/components/uniforms/uniform-actions";

/** The tenues bought for a student this year — shown when the school sells them. */
export function StudentUniformsCard({
  card,
  student,
  offline = false,
}: {
  card: UniformStudentCard;
  student: { id: string; label: string };
  offline?: boolean;
}) {
  const standing = card.sales.filter((s) => !s.cancelled);
  const toDeliver = standing.reduce((n, s) => n + s.toDeliver, 0);
  return (
    <Card>
      <div className="flex items-center gap-2">
        <div className="text-[15px] font-semibold">Tenues</div>
        <div className="flex-1" />
        {toDeliver > 0 && <Badge tone="gold">{toDeliver} à remettre</Badge>}
      </div>
      {card.sales.length === 0 ? (
        <p className="text-[12.5px] text-(--color-text-muted) mt-1.5">Aucune tenue achetée cette année.</p>
      ) : (
        <div className="grid gap-2 mt-2.5">
          {card.sales.map((s) => (
            <div key={s.id} className="flex items-start gap-2.5 text-[13px] border-t border-(--color-border-row) pt-2 first:border-t-0 first:pt-0">
              <div className="flex-1 min-w-0">
                <div className={s.cancelled ? "line-through text-(--color-text-muted)" : ""}>{s.description}</div>
                <div className="text-[12px] text-(--color-text-muted)">
                  {formatDate(s.date)} · {formatAmount(s.amount)} CFA
                  {s.receiptNumber > 0 ? ` · reçu N° ${String(s.receiptNumber).padStart(4, "0")}` : " · hors ligne"}
                  {s.cancelled ? " · annulée" : ""}
                </div>
              </div>
              {!s.cancelled && (s.toDeliver > 0 || s.lines.some((l) => l.delivered)) && (
                <UniformDeliverButton lines={s.lines} label={student.label} disabled={!s.synced} />
              )}
              {!offline && !s.cancelled && s.receiptNumber > 0 && (
                <a href={`/api/tenues/recus/${s.id}/pdf`} target="_blank" className="text-[12.5px] text-(--color-primary) font-semibold pt-1.5">
                  PDF
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3.5">
        <UniformSaleButton
          studentId={student.id}
          className="h-[36px] rounded-[9px] bg-(--color-primary) text-white px-3.5 text-[13px] font-semibold"
        >
          Vendre des tenues
        </UniformSaleButton>
      </div>
    </Card>
  );
}
