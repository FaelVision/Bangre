import { monthLabel, monthShortLabel, type CanteenMonthStatus } from "@/lib/canteen";
import { cn } from "@/lib/cn";

const tone: Record<CanteenMonthStatus, string> = {
  paid: "bg-(--color-success-bg) text-(--color-success-text) border-transparent",
  late: "bg-(--color-danger-bg) text-(--color-danger-text) border-transparent",
  due: "bg-(--color-gold-chip-bg) text-(--color-gold-text) border-transparent",
  upcoming: "bg-white text-(--color-text-muted) border-(--color-border-strong)",
  skipped: "bg-(--color-bg-page) text-(--color-text-placeholder) border-dashed border-(--color-border-strong) line-through",
};

const statusWord: Record<CanteenMonthStatus, string> = {
  paid: "payé",
  late: "en retard",
  due: "à payer ce mois-ci",
  upcoming: "à venir",
  skipped: "sans cantine",
};

/** A student's canteen year at a glance: one chip per month they are enrolled for. */
export function MonthChips({
  months,
  className,
}: {
  months: { month: string; status: CanteenMonthStatus }[];
  className?: string;
}) {
  if (months.length === 0) return <span className="text-[12.5px] text-(--color-text-muted)">Aucun mois</span>;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {months.map((m) => (
        <span
          key={m.month}
          title={`${monthLabel(m.month)} · ${statusWord[m.status]}`}
          className={cn(
            "inline-flex h-[22px] min-w-[38px] items-center justify-center rounded-md border px-1.5 text-[11px] font-semibold",
            tone[m.status]
          )}
        >
          {m.status === "paid" ? "✓ " : ""}
          {monthShortLabel(m.month)}
        </span>
      ))}
    </div>
  );
}

export function MonthLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-(--color-text-muted)">
      {(Object.keys(statusWord) as CanteenMonthStatus[]).map((status) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <span className={cn("inline-block w-3 h-3 rounded-[4px] border", tone[status])} />
          {statusWord[status].charAt(0).toUpperCase() + statusWord[status].slice(1)}
        </span>
      ))}
    </div>
  );
}
