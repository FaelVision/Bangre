"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMonths, capitalize, monthLabel, monthRange } from "@/lib/canteen";
import type { CanteenEnrollCandidate } from "@/lib/canteen-overview";
import { enrollInCanteen, leaveCanteen } from "@/lib/canteen-client";
import { cn } from "@/lib/cn";
import { levelsNotice, serviceInfo, type SchoolService } from "@/lib/services";

const selectClass =
  "w-full h-[42px] border border-(--color-border-strong) rounded-[10px] px-3 text-[13.5px] bg-white focus:outline-none focus:border-(--color-primary)";

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-[#281C14]/42 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-(--color-bg-app) rounded-[18px] shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-(--color-border) flex items-center gap-3">
          <div className="min-w-0">
            <div className="text-[15.5px] font-semibold">{title}</div>
            {subtitle && <div className="text-[12.5px] text-(--color-text-muted) mt-0.5">{subtitle}</div>}
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-[9px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[15px] text-(--color-text-mutedalt) cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Enrols students in the canteen (or the garde): one, a whole class, or a
 * hand-picked list, from a chosen month. Only those enrolled are billed.
 */
export function CanteenEnrollButton({
  service,
  candidates,
  firstMonth,
  lastMonth,
  currentMonth,
  preselect,
  className,
  children,
}: {
  service: SchoolService;
  candidates: CanteenEnrollCandidate[];
  firstMonth: string;
  lastMonth: string;
  currentMonth: string;
  /** Opens with these students already ticked — the "Inscrire à la cantine" of a student file. */
  preselect?: string[];
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("cursor-pointer", className)}>
        {children}
      </button>
      {open && (
        <EnrollModal
          service={service}
          candidates={candidates}
          firstMonth={firstMonth}
          lastMonth={lastMonth}
          currentMonth={currentMonth}
          preselect={preselect}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function EnrollModal({
  service,
  candidates,
  firstMonth,
  lastMonth,
  currentMonth,
  preselect,
  onClose,
}: {
  service: SchoolService;
  candidates: CanteenEnrollCandidate[];
  firstMonth: string;
  lastMonth: string;
  currentMonth: string;
  preselect?: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const info = serviceInfo(service);
  const notice = levelsNotice(service);
  const months = monthRange(firstMonth, lastMonth);
  const defaultStart = currentMonth < firstMonth ? firstMonth : currentMonth > lastMonth ? lastMonth : currentMonth;
  const [startMonth, setStartMonth] = useState(defaultStart);
  const [classId, setClassId] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(preselect ?? []));
  const [outcome, setOutcome] = useState<{ enrolled: number; errors: string[]; queued: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of candidates) if (!seen.has(c.classId)) seen.set(c.classId, c.className);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [candidates]);

  const visible = candidates.filter((c) => {
    if (classId && c.classId !== classId) return false;
    const q = query.trim().toLowerCase();
    return !q || c.label.toLowerCase().includes(q) || c.matricule.toLowerCase().includes(q);
  });
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of visible) {
        if (allVisibleSelected) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });
  }

  function submit() {
    const students = candidates.filter((c) => selected.has(c.id)).map((c) => ({ id: c.id, label: c.label }));
    if (students.length === 0) return;
    startTransition(async () => {
      const res = await enrollInCanteen(students, startMonth, service);
      setOutcome(res);
      if (!res.queued) router.refresh();
    });
  }

  if (outcome) {
    return (
      <Modal title={`Inscription à ${info.the}`} onClose={onClose}>
        <div className="p-5">
          <div className="text-[15px] font-semibold text-(--color-success-text)">
            {outcome.enrolled} élève{outcome.enrolled > 1 ? "s" : ""} inscrit{outcome.enrolled > 1 ? "s" : ""}
            {outcome.queued ? " sur cet appareil" : ""}
          </div>
          <p className="text-[13px] text-(--color-text-muted) mt-1.5">
            {outcome.queued
              ? "Hors ligne : les inscriptions partent au serveur au retour du réseau."
              : `${capitalize(info.the)} leur est due dès ${monthLabel(startMonth)}.`}
          </p>
          {outcome.errors.map((e) => (
            <p key={e} className="text-[13px] text-(--color-danger-text) mt-1.5">
              {e}
            </p>
          ))}
          <button
            type="button"
            onClick={onClose}
            className="w-full h-[42px] rounded-[10px] bg-(--color-primary) text-white text-[13.5px] font-semibold cursor-pointer mt-4"
          >
            Fermer
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Inscrire à ${info.the}`}
      subtitle={`Seuls les élèves inscrits paient ${info.the}, à partir du mois choisi.${notice ? ` ${notice}` : ""}`}
      onClose={onClose}
    >
      <div className="px-5 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <label className="block">
          <span className="block text-[12px] font-semibold text-(--color-text-secondary) mb-1">À partir de</span>
          <select value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className={selectClass}>
            {months.map((m) => (
              <option key={m} value={m}>
                {capitalize(monthLabel(m))}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[12px] font-semibold text-(--color-text-secondary) mb-1">Classe</span>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className={selectClass}>
            <option value="">Toutes les classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un élève…"
          className={cn(selectClass, "sm:col-span-2")}
        />
      </div>

      <div className="px-5 pt-3 pb-1 flex items-center gap-2 text-[12.5px]">
        <button
          type="button"
          onClick={toggleVisible}
          disabled={visible.length === 0}
          className="font-semibold text-(--color-primary) cursor-pointer disabled:opacity-50"
        >
          {allVisibleSelected ? "Tout désélectionner" : `Tout sélectionner (${visible.length})`}
        </button>
        <div className="flex-1" />
        <span className="text-(--color-text-muted)">{selected.size} sélectionné(s)</span>
      </div>

      <div className="px-3 pb-2 overflow-y-auto min-h-[120px]">
        {visible.length === 0 && (
          <div className="text-[13px] text-(--color-text-muted) text-center py-6">
            {candidates.length === 0
              ? notice
                ? `Tous les élèves de maternelle et du primaire sont déjà inscrits à ${info.the}.`
                : `Tous les élèves actifs sont déjà inscrits à ${info.the}.`
              : "Aucun élève ne correspond."}
          </div>
        )}
        {visible.map((c) => (
          <label
            key={c.id}
            className="flex items-center gap-3 rounded-[10px] px-2.5 py-2 cursor-pointer hover:bg-(--color-bg-subtle)"
          >
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              className="w-4 h-4 accent-(--color-primary)"
            />
            <span className="text-[13.5px] font-medium flex-1 min-w-0 truncate">{c.label}</span>
            <span className="text-[12px] text-(--color-text-muted) shrink-0">
              {c.className} · {c.matricule}
            </span>
          </label>
        ))}
      </div>

      <div className="px-5 py-3.5 border-t border-(--color-border) flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 h-[42px] rounded-[10px] border border-(--color-border-strong) bg-white text-[13.5px] font-semibold cursor-pointer"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || selected.size === 0}
          className="flex-[1.5] h-[42px] rounded-[10px] bg-(--color-primary) text-white text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
        >
          {pending ? "Inscription…" : `Inscrire ${selected.size || ""} élève${selected.size > 1 ? "s" : ""}`}
        </button>
      </div>
    </Modal>
  );
}

/** Takes a student out of the canteen (or the garde) after the last month they come. */
export function CanteenLeaveButton({
  service,
  student,
  startMonth,
  lastMonth,
  currentMonth,
  className,
}: {
  service: SchoolService;
  student: { id: string; label: string };
  /** When the current stretch began. */
  startMonth: string;
  lastMonth: string;
  currentMonth: string;
  className?: string;
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
        Retirer
      </button>
      {open && (
        <LeaveModal
          service={service}
          student={student}
          startMonth={startMonth}
          lastMonth={lastMonth}
          currentMonth={currentMonth}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function LeaveModal({
  service,
  student,
  startMonth,
  lastMonth,
  currentMonth,
  onClose,
}: {
  service: SchoolService;
  student: { id: string; label: string };
  startMonth: string;
  lastMonth: string;
  currentMonth: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const info = serviceInfo(service);
  const months = monthRange(startMonth, lastMonth);
  const cancelValue = "cancel";
  const [value, setValue] = useState(months.includes(currentMonth) ? currentMonth : (months[months.length - 1] ?? cancelValue));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ queued: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    // "No month at all" is sent as the month before the stretch began.
    const endMonth = value === cancelValue ? addMonths(startMonth, -1) : value;
    startTransition(async () => {
      const res = await leaveCanteen(student, endMonth, service);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone({ queued: res.queued });
      if (!res.queued) router.refresh();
    });
  }

  return (
    <Modal title={`Retirer de ${info.the} · ${student.label}`} onClose={onClose}>
      <div className="p-5">
        {done ? (
          <>
            <div className="text-[14.5px] font-semibold text-(--color-success-text)">
              {done.queued ? "Sortie enregistrée sur cet appareil" : `Sortie de ${info.the} enregistrée`}
            </div>
            <p className="text-[13px] text-(--color-text-muted) mt-1.5">
              Les mois suivants ne lui seront plus demandés. Vous pourrez le réinscrire plus tard si besoin.
            </p>
          </>
        ) : (
          <>
            <label className="block">
              <span className="block text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">
                Dernier mois à {info.the}
              </span>
              <select value={value} onChange={(e) => setValue(e.target.value)} className={selectClass}>
                <option value={cancelValue}>Aucun : annuler l&apos;inscription</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {capitalize(monthLabel(m))}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[12.5px] text-(--color-text-muted) mt-2 leading-relaxed">
              Les mois jusqu&apos;à celui-ci restent dus. Un mois déjà payé ne peut pas être retiré : il doit
              rester compris.
            </p>
            {error && <p className="text-[13px] text-(--color-danger-text) mt-2.5">{error}</p>}
          </>
        )}
        <div className="flex gap-2.5 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-[42px] rounded-[10px] border border-(--color-border-strong) bg-white text-[13.5px] font-semibold cursor-pointer"
          >
            {done ? "Fermer" : "Annuler"}
          </button>
          {!done && (
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="flex-[1.5] h-[42px] rounded-[10px] bg-(--color-danger-text) text-white text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
            >
              {pending ? "Enregistrement…" : `Retirer de ${info.the}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
