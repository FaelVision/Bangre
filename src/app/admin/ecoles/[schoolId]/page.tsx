import Link from "next/link";
import { notFound } from "next/navigation";
import { verifyAdmin } from "@/lib/admin-dal";
import { getSchoolDetail, getAdminOverview } from "@/lib/admin-queries";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui";
import { StateBadge } from "../../state-badge";
import { SchoolActions } from "./school-actions";

export default async function AdminSchoolPage({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = await params;
  const admin = await verifyAdmin();
  const [data, overview] = await Promise.all([getSchoolDetail(schoolId), getAdminOverview()]);
  if (!data) notFound();

  const { school, state, daysLeft } = data;

  return (
    <AdminShell adminName={admin.name} current="ecoles" openErrors={overview.stats.openErrors}>
      <div className="text-[12.5px] text-(--color-text-muted)">
        <Link href="/admin" className="text-(--color-primary) font-medium">
          Établissements
        </Link>{" "}
        › {school.name}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-1.5">
        <div className="text-[21px] font-semibold tracking-tight">{school.name}</div>
        <StateBadge state={state} />
      </div>
      <div className="text-[13px] text-(--color-text-muted) mt-1">
        {[school.city, school.type].filter(Boolean).join(" · ") || "Ville et type non renseignés"} · inscrit le{" "}
        {formatDate(school.createdAt)}
      </div>

      {school.blocked && (
        <div className="mt-4 rounded-xl border border-(--color-danger-border) bg-(--color-danger-bg-soft) px-4 py-3">
          <div className="text-[13.5px] font-semibold text-(--color-danger-text)">
            Compte bloqué {school.blockedAt ? `le ${formatDate(school.blockedAt)}` : ""}
          </div>
          <div className="text-[13px] text-(--color-text-secondary) mt-1">
            {school.blockedReason || "Aucun motif enregistré."} — l&apos;équipe voit un écran de suspension à la
            connexion ; ses données sont conservées.
          </div>
        </div>
      )}

      <div className="grid gap-4 mt-4 grid-cols-1 xl:grid-cols-[1fr_360px] items-start">
        <div className="grid gap-4">
          <Card>
            <div className="text-[15px] font-semibold">Abonnement</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3.5">
              <Info label="État" value={state === "active" ? "Abonné" : state === "trial" ? "Essai" : state === "blocked" ? "Bloqué" : "Expiré"} />
              <Info
                label={state === "active" ? "Renouvellement" : "Fin d'essai"}
                value={formatDate(state === "active" ? school.subscriptionRenewsAt : school.trialEndsAt)}
              />
              <Info
                label="Échéance"
                value={daysLeft === null ? "—" : daysLeft < 0 ? `dépassée de ${-daysLeft} j` : `dans ${daysLeft} j`}
              />
              <Info label="Total encaissé" value={`${formatAmount(school.subscriptionPayments.filter((p) => p.status === "success").reduce((s, p) => s + p.amount, 0))} CFA`} />
            </div>

            <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mt-5 mb-2">
              Paiements d&apos;abonnement
            </div>
            {school.subscriptionPayments.length === 0 && (
              <div className="text-[13px] text-(--color-text-muted) py-2">Aucun paiement enregistré.</div>
            )}
            {school.subscriptionPayments.map((p) => (
              <div key={p.id} className="flex justify-between items-center py-2 border-b border-(--color-border-row) last:border-b-0">
                <div>
                  <div className="text-[13.5px] font-medium tabular-nums">{formatAmount(p.amount)} CFA</div>
                  <div className="text-[12px] text-(--color-text-muted)">
                    {p.provider === "orange_money" ? "Orange Money" : "Moov Money"} · {formatDateTime(p.createdAt)}
                  </div>
                </div>
                <span className={`text-[12px] font-semibold ${p.status === "success" ? "text-(--color-success-text)" : "text-(--color-danger-text)"}`}>
                  {p.status === "success" ? "Réussi" : p.status === "pending" ? "En attente" : "Échoué"}
                </span>
              </div>
            ))}
          </Card>

          <Card>
            <div className="text-[15px] font-semibold">Utilisation</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3.5">
              <Info label="Classes" value={String(school._count.classes)} />
              <Info label="Élèves" value={String(school._count.students)} />
              <Info label="Paiements saisis" value={String(school._count.payments)} />
              <Info label="Rappels envoyés" value={String(school._count.reminders)} />
            </div>
            <div className="text-[12.5px] text-(--color-text-muted) mt-3.5">
              Années scolaires : {school.academicYears.map((y) => `${y.label}${y.isCurrent ? " (en cours)" : ""}`).join(", ") || "—"}
            </div>
          </Card>

          {school.errorLogs.length > 0 && (
            <Card className="border-(--color-danger-border)">
              <div className="text-[15px] font-semibold">Erreurs rencontrées par cet établissement</div>
              <div className="grid gap-2 mt-3">
                {school.errorLogs.map((e) => (
                  <div key={e.id} className="text-[13px]">
                    <span className="font-medium">{e.message.slice(0, 110)}</span>
                    <span className="text-(--color-text-muted)"> · {e.count}× · {formatDateTime(e.lastSeenAt)}</span>
                  </div>
                ))}
              </div>
              <Link href="/admin/erreurs" className="text-[13px] font-semibold text-(--color-primary) mt-3 inline-block">
                Voir toutes les erreurs →
              </Link>
            </Card>
          )}

        </div>

        <SchoolActions
          schoolId={school.id}
          schoolName={school.name}
          contactName={school.contactName}
          phone={school.phone}
          email={school.email}
          blocked={school.blocked}
          blockedReason={school.blockedReason}
        />
      </div>
    </AdminShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] text-(--color-text-muted)">{label}</div>
      <div className="text-[14.5px] font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
