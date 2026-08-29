import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { getClassesOverview } from "@/lib/queries";
import { formatCFA } from "@/lib/format";
import { Badge, Card, PageHeader, ProgressBar } from "@/components/ui";
import { cn } from "@/lib/cn";

const LEVELS = ["Primaire", "Collège", "Lycée"] as const;

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; niveau?: string }>;
}) {
  const { schoolId } = await verifySession();
  const { q, niveau } = await searchParams;
  const overview = await getClassesOverview(schoolId);

  const undefinedCount = overview.filter((c) => c.status === "non_definie").length;

  const filtered = overview.filter((c) => {
    if (q && !c.class.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (niveau === "non_definie" && c.status !== "non_definie") return false;
    if (niveau && niveau !== "non_definie" && c.class.level !== niveau) return false;
    return true;
  });

  const chips = [
    { key: undefined, label: "Toutes" },
    ...LEVELS.map((l) => ({ key: l, label: l })),
    ...(undefinedCount > 0 ? [{ key: "non_definie", label: `Scolarité non définie · ${undefinedCount}` }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Classes"
        subtitle={`CP1 → Terminale · ${overview.length} classes actives`}
        actions={
          <>
            <form action="/classes">
              <input
                name="q"
                defaultValue={q}
                placeholder="Rechercher une classe…"
                className="h-[38px] w-[210px] border border-(--color-border-strong) rounded-[9px] bg-white px-3 text-[13.5px] placeholder:text-(--color-text-placeholder) focus:outline-none focus:border-(--color-primary)"
              />
            </form>
            <Link
              href="/classes/nouvelle"
              className="h-[38px] rounded-[9px] bg-(--color-primary) text-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline hover:bg-(--color-primary-hover)"
            >
              + Ajouter une classe
            </Link>
          </>
        }
      />

      <div className="p-5 pt-5 pb-10 px-7">
        <div className="flex gap-2 mb-4.5 flex-wrap">
          {chips.map((chip) => {
            const active = (chip.key ?? "") === (niveau ?? "");
            return (
              <Link
                key={chip.label}
                href={chip.key ? `/classes?niveau=${chip.key}` : "/classes"}
                className={cn(
                  "h-8 rounded-full flex items-center px-3.5 text-[13px] no-underline hover:no-underline",
                  active
                    ? "bg-[#221E1A] text-white font-medium"
                    : chip.key === "non_definie"
                      ? "border border-(--color-gold-border) bg-(--color-gold-bg) text-(--color-gold-text) font-medium"
                      : "border border-(--color-border-strong) bg-white text-(--color-text)"
                )}
              >
                {chip.label}
              </Link>
            );
          })}
        </div>

        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {filtered.map(({ class: c, studentCount, percent, status }) => {
            if (status === "non_definie") {
              return (
                <Card key={c.id} className="border-(--color-gold-border)">
                  <div className="flex justify-between items-start">
                    <div className="text-[18px] font-semibold">{c.name}</div>
                    <Badge tone="gold">Scolarité non définie</Badge>
                  </div>
                  <div className="text-[13px] text-(--color-text-muted) mt-2">
                    {studentCount} élèves · montant à définir
                  </div>
                  <div className="text-[12.5px] text-(--color-gold-text) bg-(--color-gold-bg) rounded-lg px-3 py-2.5 mt-3 leading-relaxed">
                    Définissez le montant et les tranches pour activer le suivi des paiements.
                  </div>
                  <Link
                    href={`/classes/${c.id}/configuration`}
                    className="h-9 rounded-[9px] bg-(--color-primary) text-white flex items-center justify-center text-[13px] font-semibold mt-3.5 no-underline hover:no-underline"
                  >
                    Configurer maintenant
                  </Link>
                </Card>
              );
            }

            const tone = status === "a_jour" ? "success" : status === "partiel" ? "gold" : "danger";
            const label = status === "a_jour" ? "À jour" : status === "partiel" ? "Partiel" : "En retard";
            const barColor =
              status === "a_jour" ? "var(--color-success-text)" : status === "partiel" ? "var(--color-gold-dot)" : "var(--color-danger-text)";

            return (
              <Card key={c.id}>
                <div className="flex justify-between items-start">
                  <div className="text-[18px] font-semibold">{c.name}</div>
                  <Badge tone={tone}>
                    {label} · {percent}%
                  </Badge>
                </div>
                <div className="text-[13px] text-(--color-text-muted) mt-2">
                  {studentCount} élèves · scolarité{" "}
                  <b className="text-(--color-text) tabular-nums">{formatCFA(c.tuitionAmount ?? 0)}</b>
                </div>
                <div className="mt-3.5">
                  <ProgressBar percent={percent ?? 0} color={barColor} />
                </div>
                <div className="flex gap-2 mt-4">
                  <Link
                    href={`/classes/${c.id}/eleves`}
                    className="flex-1 h-9 rounded-[9px] border border-(--color-border-strong) bg-(--color-bg-subtle) flex items-center justify-center text-[13px] font-semibold no-underline hover:no-underline"
                  >
                    Élèves
                  </Link>
                  <Link
                    href={`/classes/${c.id}/configuration`}
                    className="flex-1 h-9 rounded-[9px] border border-(--color-border-strong) bg-(--color-bg-subtle) flex items-center justify-center text-[13px] font-semibold no-underline hover:no-underline"
                  >
                    Configurer
                  </Link>
                </div>
              </Card>
            );
          })}

          <Link
            href="/classes/nouvelle"
            className="rounded-2xl border-[1.5px] border-dashed border-(--color-border-strong) flex flex-col items-center justify-center gap-1 text-(--color-text-muted) min-h-[170px] bg-(--color-bg-subtle) no-underline hover:no-underline"
          >
            <div className="text-[22px] text-(--color-primary)">+</div>
            <div className="text-sm font-semibold text-(--color-text-secondary)">Ajouter une classe</div>
            <div className="text-[12.5px] text-center px-4">Ex. « 6ᵉ C », « Section franco-arabe »</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
