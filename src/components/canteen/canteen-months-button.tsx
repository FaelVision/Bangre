"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { capitalize, monthKey, monthLabel, monthRange, monthShortLabel, type CanteenMonthStatus } from "@/lib/canteen";
import { changeCanteenStart, setCanteenSkip } from "@/lib/canteen-client";
import { cn } from "@/lib/cn";

const statusText: Record<CanteenMonthStatus, string> = {
  paid: "Payé",
  late: "En retard",
  due: "Ce mois-ci",
  upcoming: "À venir",
  skipped: "Sans cantine",
};

/**
 * "Mois" — the months a student eats at the canteen. A month they skip (away,
 * sick, the parent said so) is marked "sans cantine": not owed, never late,
 * the student stays enrolled. Before the month or after it, both work.
 */
export function CanteenMonthsButton({
  student,
  months,
  enrollment,
  className,
  children = "Mois",
}: {
  student: { id: string; label: string };
  months: { month: string; status: CanteenMonthStatus }[];
  /** The stretch running now, whose first month can be corrected. */
  enrollment?: { startMonth: string; firstMonth: string; lastMonth: string } | null;
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "h-8 rounded-lg border border-(--color-border-strong) bg-white px-2.5 text-[12px] font-semibold cursor-pointer",
          className
        )}
      >
        {children}
      </button>
      {open && (
        <MonthsModal student={student} initial={months} enrollment={enrollment ?? null} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function MonthsModal({
  student,
  initial,
  enrollment,
  onClose,
}: {
  student: { id: string; label: string };
  initial: { month: string; status: CanteenMonthStatus }[];
  enrollment: { startMonth: string; firstMonth: string; lastMonth: string } | null;
  onClose: () => void;
}) {
  const [start, setStart] = useState(enrollment?.startMonth ?? "");
  const [savingStart, setSavingStart] = useState(false);
  const router = useRouter();
  // Shown at once; the server (or the outbox) records it meanwhile.
  const [months, setMonths] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [changed, setChanged] = useState(false);
  const [, startTransition] = useTransition();

  /**
   * What a month goes back to once "sans cantine" is taken off — near enough
   * for the window (the due day is not known here); the page recomputes it
   * exactly when the window closes.
   */
  function unskippedStatus(month: string): CanteenMonthStatus {
    const known = initial.find((m) => m.month === month && m.status !== "skipped")?.status;
    if (known) return known;
    const current = monthKey(new Date());
    return month < current ? "late" : month === current ? "due" : "upcoming";
  }

  function toggle(month: string, status: CanteenMonthStatus) {
    if (status === "paid" || busy) return;
    const skipped = status !== "skipped";
    setError(null);
    setBusy(month);
    startTransition(async () => {
      const res = await setCanteenSkip(student, month, skipped);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.queued) setQueued(true);
      setChanged(true);
      setMonths((prev) =>
        prev.map((m) => (m.month === month ? { ...m, status: skipped ? "skipped" : unskippedStatus(month) } : m))
      );
    });
  }

  function close() {
    if (changed && !queued) router.refresh();
    onClose();
  }

  function saveStart() {
    if (!enrollment || start === enrollment.startMonth) return;
    setError(null);
    setSavingStart(true);
    startTransition(async () => {
      const res = await changeCanteenStart(student.id, start);
      setSavingStart(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // The months owed change with it: reload rather than guess them here.
      router.refresh();
      onClose();
    });
  }

  const skippedCount = months.filter((m) => m.status === "skipped").length;

  return (
    <div className="fixed inset-0 bg-[#281C14]/42 flex items-center justify-center p-4 z-50" onClick={close}>
      <div
        className="bg-(--color-bg-app) rounded-[18px] shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-(--color-border) flex items-center gap-3">
          <div className="min-w-0">
            <div className="text-[15.5px] font-semibold">Mois de cantine · {student.label}</div>
            <div className="text-[12.5px] text-(--color-text-muted) mt-0.5">
              Touchez un mois où l&apos;enfant ne mange pas à la cantine : il ne sera ni dû ni en retard.
            </div>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={close}
            aria-label="Fermer"
            className="w-8 h-8 rounded-[9px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[15px] text-(--color-text-mutedalt) cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {enrollment && (
            <div className="flex flex-wrap items-end gap-2 mb-4 pb-4 border-b border-(--color-border)">
              <label className="block flex-1 min-w-[180px]">
                <span className="block text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">
                  Inscrit à la cantine depuis
                </span>
                <select
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full h-[42px] border border-(--color-border-strong) rounded-[10px] px-3 text-[13.5px] bg-white focus:outline-none focus:border-(--color-primary)"
                >
                  {monthRange(enrollment.firstMonth, enrollment.lastMonth).map((m) => (
                    <option key={m} value={m}>
                      {capitalize(monthLabel(m))}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={saveStart}
                disabled={savingStart || start === enrollment.startMonth}
                className="h-[42px] rounded-[10px] border border-(--color-border-strong) bg-white px-4 text-[13px] font-semibold cursor-pointer disabled:opacity-50"
              >
                {savingStart ? "…" : "Corriger le début"}
              </button>
            </div>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {months.map((m) => {
              const skipped = m.status === "skipped";
              const paid = m.status === "paid";
              return (
                <button
                  key={m.month}
                  type="button"
                  disabled={paid || busy !== null}
                  onClick={() => toggle(m.month, m.status)}
                  title={
                    paid
                      ? `${capitalize(monthLabel(m.month))} est payé`
                      : skipped
                        ? `Remettre ${monthLabel(m.month)} à la cantine`
                        : `Marquer ${monthLabel(m.month)} sans cantine`
                  }
                  className={cn(
                    "h-[52px] rounded-[10px] px-2 text-left cursor-pointer disabled:cursor-default",
                    paid
                      ? "bg-(--color-success-bg) border border-transparent text-(--color-success-text)"
                      : skipped
                        ? "bg-(--color-bg-page) border border-dashed border-(--color-border-strong) text-(--color-text-placeholder)"
                        : "bg-white border border-(--color-border-strong)",
                    busy === m.month && "opacity-60"
                  )}
                >
                  <div className={cn("text-[13px] font-semibold", skipped && "line-through")}>
                    {monthShortLabel(m.month)} {m.month.slice(0, 4)}
                  </div>
                  <div
                    className={cn(
                      "text-[11px]",
                      m.status === "late" ? "text-(--color-danger-text)" : paid ? "" : "text-(--color-text-muted)"
                    )}
                  >
                    {busy === m.month ? "…" : statusText[m.status]}
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-[12.5px] text-(--color-text-muted) mt-3 leading-relaxed">
            {skippedCount > 0
              ? `${skippedCount} mois sans cantine. Touchez-le de nouveau pour le remettre.`
              : "Tous les mois de l'inscription sont dus."}{" "}
            Un mois payé ne peut pas être marqué sans cantine. Le tarif annuel et les forfaits ne s&apos;appliquent
            plus s&apos;ils comprennent un mois sans cantine.
          </p>
          {queued && (
            <p className="text-[12.5px] text-(--color-gold-text) mt-2">
              Hors ligne : enregistré sur cet appareil, envoyé au retour du réseau.
            </p>
          )}
          {error && (
            <p role="alert" className="text-[13px] text-(--color-danger-text) mt-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-(--color-border)">
          <button
            type="button"
            onClick={close}
            className="w-full h-[42px] rounded-[10px] bg-(--color-primary) text-white text-[13.5px] font-semibold cursor-pointer"
          >
            Terminé
          </button>
        </div>
      </div>
    </div>
  );
}
