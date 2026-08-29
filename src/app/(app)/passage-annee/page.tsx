import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { getPromotionOverview } from "@/lib/queries";
import { nextAcademicYearLabel } from "@/lib/promotion";
import { Card, PageHeader } from "@/components/ui";
import { FinalizeButton } from "./finalize-button";

export default async function YearTransitionPage() {
  const { schoolId } = await verifySession();
  const data = await getPromotionOverview(schoolId);

  if (!data.currentYear) {
    return <div className="p-8 text-(--color-text-muted)">Aucune année scolaire active.</div>;
  }

  const total = data.pending.length + data.validatedCount;
  const nextLabel = nextAcademicYearLabel(data.currentYear.label);

  return (
    <div>
      <PageHeader
        title="Passage d'année"
        subtitle={`${data.currentYear.label} → ${nextLabel} · ${data.validatedCount}/${total} classes validées`}
        actions={data.nextYearExists ? <FinalizeButton /> : undefined}
      />

      <div className="p-7">
        <div className="text-[13px] text-(--color-text-muted) mb-4 leading-relaxed max-w-2xl">
          Validez chaque classe une par une : tous les élèves sont cochés « passent » par défaut, il suffit de
          décocher les redoublants. Une fois toutes les classes traitées, terminez le passage d&apos;année pour
          activer {nextLabel}.
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {data.pending.map(({ class: c, studentCount }) => (
            <Link key={c.id} href={`/passage-annee/${c.id}`} className="no-underline hover:no-underline">
              <Card className="hover:shadow-sm transition-shadow">
                <div className="text-[16px] font-semibold">{c.name}</div>
                <div className="text-[13px] text-(--color-text-muted) mt-1">{studentCount} élèves</div>
                <div className="text-[12.5px] text-(--color-primary) font-semibold mt-2.5">Traiter cette classe →</div>
              </Card>
            </Link>
          ))}
        </div>

        {data.pending.length === 0 && (
          <div className="text-[13.5px] text-(--color-success-text) font-medium mt-2">
            Toutes les classes ont été traitées pour {data.currentYear.label}.
          </div>
        )}
      </div>
    </div>
  );
}
