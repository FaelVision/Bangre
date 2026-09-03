"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { validateClassPromotionAction, type Decision } from "@/lib/actions/promotion";

type StudentRow = {
  id: string;
  matricule: string;
  lastName: string;
  firstName: string;
  statusLabel: string;
  statusTone: "success" | "gold" | "danger";
};

export function PromotionScreen({
  classId,
  className,
  level,
  suggestedTarget,
  students,
}: {
  classId: string;
  className: string;
  level: string;
  suggestedTarget: string;
  students: StudentRow[];
}) {
  const router = useRouter();
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    Object.fromEntries(students.map((s) => [s.id, "promote" as Decision]))
  );
  const [targetName, setTargetName] = useState(suggestedTarget);
  const [targetLevel, setTargetLevel] = useState(level);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      students.filter((s) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return `${s.lastName} ${s.firstName} ${s.matricule}`.toLowerCase().includes(q);
      }),
    [students, query]
  );

  const promotedCount = Object.values(decisions).filter((d) => d === "promote").length;
  const repeatingIds = students.filter((s) => decisions[s.id] === "repeat").map((s) => s.id);
  const specialIds = students.filter((s) => decisions[s.id] === "transferred" || decisions[s.id] === "left");

  function setDecision(id: string, d: Decision) {
    setDecisions((prev) => ({ ...prev, [id]: d }));
  }
  function toggle(id: string) {
    setDecision(id, decisions[id] === "promote" ? "repeat" : "promote");
  }
  function checkAll() {
    setDecisions(Object.fromEntries(students.map((s) => [s.id, "promote"])));
  }
  function uncheckAll() {
    setDecisions(Object.fromEntries(students.map((s) => [s.id, "repeat"])));
  }
  function uncheckUnpaid() {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const s of students) {
        if (s.statusTone !== "success") next[s.id] = "repeat";
      }
      return next;
    });
  }

  function submit() {
    startTransition(async () => {
      const res = await validateClassPromotionAction({
        sourceClassId: classId,
        targetClassName: targetName,
        targetLevel,
        decisions,
      });
      if (res && "error" in res) alert(res.error);
      else router.push("/passage-annee");
    });
  }

  const mainStudents = filtered.filter((s) => decisions[s.id] === "promote" || decisions[s.id] === "repeat");

  return (
    <div>
      <div className="border-b border-(--color-border) flex flex-col lg:flex-row lg:items-center gap-3 px-4 lg:px-7 py-3.5 lg:py-0 lg:h-[70px]">
        <div className="min-w-0">
          <div className="text-[12.5px] text-(--color-text-muted)">Passage d&apos;année</div>
          <div className="text-[17px] lg:text-[19px] font-semibold tracking-tight mt-0.5 flex items-center gap-2">
            {className} →{" "}
            <input
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              className="border-b border-dashed border-(--color-border-strong) bg-transparent focus:outline-none focus:border-(--color-primary) w-32 lg:w-40 min-w-0"
            />
          </div>
        </div>
        <select
          value={targetLevel}
          onChange={(e) => setTargetLevel(e.target.value)}
          className="h-9 border border-(--color-border-strong) rounded-lg bg-white px-2.5 text-[12.5px] self-start lg:self-auto"
          title="Niveau de la classe cible"
        >
          <option value="Primaire">Primaire</option>
          <option value="Collège">Collège</option>
          <option value="Lycée">Lycée</option>
        </select>
        <div className="hidden lg:block lg:flex-1" />
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/passage-annee"
            className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline"
          >
            Annuler
          </Link>
          <button
            onClick={submit}
            disabled={pending}
            className="h-[38px] rounded-[9px] bg-(--color-primary) text-white flex items-center px-4 text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
          >
            {pending ? "Validation…" : "Valider cette classe"}
          </button>
        </div>
      </div>

      <div className="bg-(--color-gold-bg) border-b border-(--color-gold-border) px-4 lg:px-7 py-4 flex flex-wrap items-center gap-3.5">
        <div className="w-[26px] h-[26px] rounded-lg bg-(--color-primary) text-white flex items-center justify-center text-sm font-bold shrink-0">
          ✓
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-[14.5px] font-semibold">Tous les élèves cochés passent en {targetName}</div>
          <div className="text-[13px] text-(--color-gold-text) mt-0.5">
            Décochez uniquement ceux qui redoublent — rien d&apos;autre à saisir.
          </div>
        </div>
        <div className="flex gap-5.5 text-right">
          <div>
            <div className="text-[22px] font-bold text-(--color-success-text) tabular-nums">{promotedCount}</div>
            <div className="text-xs text-(--color-text-mutedalt)">cochés → passent</div>
          </div>
          <div>
            <div className="text-[22px] font-bold text-(--color-gold-text-dark) tabular-nums">{repeatingIds.length}</div>
            <div className="text-xs text-(--color-text-mutedalt)">décochés → redoublent</div>
          </div>
        </div>
      </div>

      <div className="p-4 lg:px-7 pb-10 grid gap-4 items-start grid-cols-1 xl:grid-cols-[1fr_288px]">
        <div>
          <div className="flex gap-2.5 items-center mb-3 flex-wrap">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un élève à décocher…"
              className="flex-1 min-w-[200px] h-10 border border-(--color-border-strong) rounded-[10px] bg-white px-3.5 text-[13.5px] focus:outline-none focus:border-(--color-primary)"
            />
            <button onClick={checkAll} className="h-10 rounded-[10px] border border-(--color-border-strong) bg-white px-3.5 text-[13px] font-semibold cursor-pointer">
              Tout cocher
            </button>
            <button onClick={uncheckAll} className="h-10 rounded-[10px] border border-(--color-border-strong) bg-white px-3.5 text-[13px] font-semibold cursor-pointer">
              Tout décocher
            </button>
            <button onClick={uncheckUnpaid} className="h-10 rounded-[10px] border border-(--color-border-strong) bg-white px-3.5 text-[13px] font-semibold cursor-pointer">
              Décocher les non soldés
            </button>
          </div>

          <div className="bg-white border border-(--color-border) rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 bg-(--color-bg-subtle) border-b border-(--color-border)">
              <span className="w-[18px] h-[18px] rounded-md bg-(--color-primary) text-white flex items-center justify-center text-[11px]">✓</span>
              <span className="text-[13px] font-semibold">{students.length} élèves de la {className}</span>
              <div className="flex-1" />
              <span className="text-[12.5px] text-(--color-text-muted)">Un clic sur la ligne coche ou décoche</span>
            </div>
            {mainStudents.map((s) => {
              const checked = decisions[s.id] === "promote";
              return (
                <div
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3 border-b border-(--color-border-row) last:border-b-0 cursor-pointer hover:bg-(--color-bg-subtle)"
                  style={{ background: checked ? undefined : "var(--color-gold-bg)" }}
                >
                  <span
                    className="w-5 h-5 rounded-md flex items-center justify-center text-xs shrink-0"
                    style={{
                      background: checked ? "var(--color-success-text)" : "#fff",
                      color: checked ? "#fff" : "transparent",
                      border: checked ? "none" : "1.5px solid #C9C1B5",
                    }}
                  >
                    ✓
                  </span>
                  <span className="text-[13px] text-(--color-text-mutedalt) w-20 tabular-nums">{s.matricule}</span>
                  <span className="text-[14px] font-semibold flex-1 min-w-[120px]">
                    {s.lastName} {s.firstName}
                  </span>
                  <Badge tone={s.statusTone}>{s.statusLabel}</Badge>
                  <span
                    className="text-[13px] w-[130px] text-left sm:text-right"
                    style={{ color: checked ? "var(--color-text-secondary)" : "var(--color-gold-text-dark)", fontWeight: checked ? 400 : 600 }}
                  >
                    {checked ? `Passe en ${targetName}` : `Redouble la ${className}`}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDecision(s.id, "transferred");
                    }}
                    className="shrink-0 h-7 rounded-lg border border-(--color-border-strong) bg-white px-2.5 text-[11.5px] font-semibold text-(--color-text-secondary) hover:border-(--color-danger-border) hover:text-(--color-danger-text) cursor-pointer ml-1"
                    title="Transfert ou sortie d'établissement"
                  >
                    Cas particulier
                  </button>
                </div>
              );
            })}
            {mainStudents.length === 0 && (
              <div className="text-center text-(--color-text-muted) py-8 text-sm">Aucun élève ne correspond.</div>
            )}
          </div>
        </div>

        <div className="grid gap-3.5">
          <div className="bg-white border border-(--color-gold-border) rounded-2xl p-4.5">
            <div className="text-[14.5px] font-semibold">Redoublants · {repeatingIds.length}</div>
            <div className="grid gap-2 mt-3">
              {students
                .filter((s) => decisions[s.id] === "repeat")
                .map((s) => (
                  <div key={s.id} className="flex justify-between items-center text-[13.5px]">
                    {s.lastName} {s.firstName}
                    <button onClick={() => setDecision(s.id, "promote")} className="text-xs text-(--color-primary) font-semibold cursor-pointer">
                      Annuler
                    </button>
                  </div>
                ))}
              {repeatingIds.length === 0 && <div className="text-[12.5px] text-(--color-text-muted)">Aucun redoublant.</div>}
            </div>
          </div>

          <div className="bg-white border border-(--color-border) rounded-2xl p-4.5">
            <div className="text-[14.5px] font-semibold">Cas particuliers</div>
            <div className="text-[12.5px] text-(--color-text-muted) mt-1 leading-relaxed">
              Transferts et sorties, traités à part.
            </div>
            <div className="grid gap-2 mt-3">
              {specialIds.map((s) => (
                <div key={s.id} className="flex justify-between items-center gap-2 text-[13px]">
                  <span className="flex-1 truncate">
                    {s.lastName} {s.firstName}
                  </span>
                  <select
                    value={decisions[s.id]}
                    onChange={(e) => setDecision(s.id, e.target.value as Decision)}
                    className="h-7 border border-(--color-border-strong) rounded-lg bg-white px-1.5 text-[12px]"
                  >
                    <option value="transferred">Transféré</option>
                    <option value="left">Sorti</option>
                  </select>
                  <button onClick={() => setDecision(s.id, "promote")} className="text-xs text-(--color-primary) font-semibold cursor-pointer">
                    Annuler
                  </button>
                </div>
              ))}
              {specialIds.length === 0 && (
                <div className="text-[12.5px] text-(--color-text-muted)">
                  Cliquez « Cas particulier » sur une ligne pour marquer un transfert ou une sortie.
                </div>
              )}
            </div>
          </div>

          <Link
            href="/eleves/nouveau"
            className="h-9 rounded-[9px] border border-(--color-border-strong) bg-(--color-bg-subtle) flex items-center justify-center text-[13px] font-semibold no-underline hover:no-underline"
          >
            + Ajouter un nouvel arrivant
          </Link>
        </div>
      </div>
    </div>
  );
}
