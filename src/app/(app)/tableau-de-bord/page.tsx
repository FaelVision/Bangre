import Link from "next/link";
import { verifySession, getCurrentAcademicYear } from "@/lib/dal";
import { getDashboardData } from "@/lib/queries";
import { formatAmount, formatCFA, formatDateTime } from "@/lib/format";
import { Card, PageHeader, ProgressBar, LinkButton } from "@/components/ui";
import { PayButton } from "@/components/pay-button";

export default async function DashboardPage() {
  const { schoolId } = await verifySession();
  const [data, year] = await Promise.all([getDashboardData(schoolId), getCurrentAcademicYear()]);

  const quickClasses = data.classSummaries.filter((c) => c.studentCount > 0).slice(0, 4);

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        subtitle={`Année ${year?.label ?? ""}`}
        actions={
          <form action="/eleves" className="flex items-center gap-2.5 w-full lg:w-auto">
            <input
              name="q"
              placeholder="Rechercher un élève, un matricule…"
              className="h-[38px] w-full lg:w-[250px] border border-(--color-border-strong) rounded-[9px] bg-white px-3 text-[13.5px] placeholder:text-(--color-text-placeholder) focus:outline-none focus:border-(--color-primary)"
            />
          </form>
        }
      />

      <div className="p-4 lg:p-7 pb-10 grid gap-4.5">
        {data.unbilledStudentCount > 0 && (
          <Link
            href="/classes?niveau=non_definie"
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[11px] border border-(--color-gold-border) bg-(--color-gold-bg) px-4 py-3 no-underline hover:no-underline"
          >
            <span className="text-[13.5px] font-semibold text-(--color-gold-text)">
              {data.unbilledStudentCount} élèves ne sont pas comptés dans ces totaux
            </span>
            <span className="text-[12.5px] text-(--color-gold-text)">
              leur classe n&apos;a pas encore de montant de scolarité.
            </span>
            <span className="text-[12.5px] font-semibold text-(--color-primary) ml-auto whitespace-nowrap">
              Configurer →
            </span>
          </Link>
        )}

        <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <div className="text-[12.5px] text-(--color-text-muted) font-medium">Total attendu</div>
            <div className="text-[26px] font-bold tracking-tight mt-2 tabular-nums whitespace-nowrap">
              {formatAmount(data.totalExpected)}
            </div>
            <div className="text-[12.5px] text-(--color-text-muted) mt-0.5">
              CFA · {data.billedStudentCount} élèves facturés
            </div>
          </Card>
          <Card>
            <div className="text-[12.5px] text-(--color-text-muted) font-medium">Total encaissé</div>
            <div className="text-[26px] font-bold tracking-tight mt-2 tabular-nums whitespace-nowrap text-(--color-success-text)">
              {formatAmount(data.totalCollected)}
            </div>
            <div className="text-[12.5px] text-(--color-text-muted) mt-0.5">CFA</div>
          </Card>
          <Card>
            <div className="text-[12.5px] text-(--color-text-muted) font-medium">Reste à recouvrer</div>
            <div className="text-[26px] font-bold tracking-tight mt-2 tabular-nums whitespace-nowrap">
              {formatAmount(data.totalRemaining)}
            </div>
            <div className="text-[12.5px] text-(--color-text-muted) mt-0.5">CFA</div>
          </Card>
          <Link href="/retards" className="no-underline hover:no-underline">
            <Card className="border-(--color-danger-border) hover:shadow-sm transition-shadow">
              <div className="text-[12.5px] text-(--color-text-muted) font-medium">Élèves en retard</div>
              <div className="text-[26px] font-bold tracking-tight mt-2 tabular-nums whitespace-nowrap text-(--color-danger-text)">
                {data.lateCount}
              </div>
              <div className="text-[12.5px] text-(--color-primary) font-semibold mt-0.5">Voir la liste →</div>
            </Card>
          </Link>
        </div>

        <Card padding="p-5.5">
          <div className="flex items-baseline justify-between">
            <div className="text-[15px] font-semibold">Où en est la scolarité de l&apos;école ?</div>
          </div>
          <div className="flex items-baseline gap-3 mt-3.5 mb-3">
            <div className="text-[40px] font-bold tracking-tight leading-none">{data.recoveryPercent}%</div>
            <div className="text-[14.5px] text-(--color-text-secondary)">des frais de scolarité sont encaissés</div>
          </div>
          <ProgressBar percent={data.recoveryPercent} height={16} />
          {/* Two nowrap legends in a `justify-between` row overflowed the card
              on a phone; wrapping keeps both readable at any width. */}
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px] text-(--color-text-secondary) mt-2.5">
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className="w-[9px] h-[9px] rounded-sm bg-(--color-primary) shrink-0" />
              Encaissé : <b className="tabular-nums">{formatCFA(data.totalCollected)}</b>
            </span>
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className="w-[9px] h-[9px] rounded-sm bg-[#EFE9DE] shrink-0" />
              Restant : <b className="tabular-nums">{formatCFA(data.totalRemaining)}</b>
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
            <div className="border border-(--color-border) bg-(--color-bg-subtle) rounded-[11px] p-3.5">
              <div className="text-[12.5px] text-(--color-text-muted)">Élèves soldés</div>
              <div className="text-[22px] font-bold mt-1 tabular-nums">{data.soldeCount}</div>
              <div className="text-xs text-(--color-text-muted)">sur {data.billedStudentCount} élèves facturés</div>
            </div>
            <div className="border border-(--color-border) bg-(--color-bg-subtle) rounded-[11px] p-3.5">
              <div className="text-[12.5px] text-(--color-text-muted)">Paiements partiels</div>
              <div className="text-[22px] font-bold mt-1 tabular-nums">{data.partielCount}</div>
              <div className="text-xs text-(--color-text-muted)">au moins une tranche payée</div>
            </div>
            <Link href="/retards" className="no-underline hover:no-underline">
              <div className="border border-(--color-danger-border) bg-(--color-danger-bg-soft) rounded-[11px] p-3.5 h-full">
                <div className="text-[12.5px] text-(--color-text-muted)">Rien payé</div>
                <div className="text-[22px] font-bold mt-1 tabular-nums text-(--color-danger-text)">{data.rienPayeCount}</div>
                <div className="text-xs text-(--color-primary) font-semibold">à relancer →</div>
              </div>
            </Link>
          </div>
        </Card>

        <div className="grid gap-3.5 grid-cols-1 xl:grid-cols-[1.5fr_1fr]">
          <Card padding="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3.5">
              <div className="text-[15px] font-semibold">Accès rapide aux classes</div>
              <Link href="/classes" className="text-[13px] text-(--color-primary) font-semibold whitespace-nowrap">
                Toutes les classes →
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {quickClasses.map(({ class: c, studentCount, percent }) => (
                <Link
                  key={c.id}
                  href={`/classes/${c.id}/eleves`}
                  className="border border-(--color-border) rounded-[11px] p-3.5 bg-(--color-bg-zebra) no-underline hover:no-underline hover:shadow-sm transition-shadow"
                >
                  <div className="text-[14.5px] font-semibold text-(--color-text)">{c.name}</div>
                  <div className="text-xs text-(--color-text-muted) mt-0.5">{studentCount} élèves</div>
                  {percent !== null ? (
                    <>
                      <div className="mt-2.5">
                        <ProgressBar
                          percent={percent}
                          height={6}
                          color={percent >= 70 ? "var(--color-success-text)" : percent >= 40 ? "var(--color-gold-dot)" : "var(--color-danger-text)"}
                        />
                      </div>
                      <div className="text-xs text-(--color-text-secondary) mt-1.5 font-semibold">{percent}%</div>
                    </>
                  ) : (
                    <div className="text-xs text-(--color-gold-text) mt-2.5 font-semibold">Non définie</div>
                  )}
                </Link>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
              <PayButton className="flex-1 inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition-colors h-[42px] sm:h-[38px] px-4 text-[13.5px] bg-(--color-primary) text-white hover:bg-(--color-primary-hover)">
                Enregistrer un paiement
              </PayButton>
              <LinkButton href="/eleves/nouveau" variant="secondary" className="flex-1 h-[42px] sm:h-[38px]">
                Ajouter un élève
              </LinkButton>
            </div>
          </Card>

          <Card padding="p-5">
            <div className="text-[15px] font-semibold mb-1.5">Derniers paiements</div>
            <div className="grid">
              {data.recentPayments.length === 0 && (
                <div className="text-[13px] text-(--color-text-muted) py-4">Aucun paiement enregistré.</div>
              )}
              {data.recentPayments.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center gap-3 py-2.5 border-b border-(--color-border-row) last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium truncate">
                      {p.student.firstName.charAt(0)}. {p.student.lastName}
                    </div>
                    <div className="text-xs text-(--color-text-muted) truncate">
                      {p.student.class.name} · {p.method === "cash" ? "espèces" : p.method} · {formatDateTime(p.date)}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums shrink-0">{formatAmount(p.amount)}</div>
                </div>
              ))}
            </div>
            <LinkButton href="/paiements" variant="secondary" className="w-full mt-3.5">
              Exporter le rapport
            </LinkButton>
          </Card>
        </div>
      </div>
    </div>
  );
}
