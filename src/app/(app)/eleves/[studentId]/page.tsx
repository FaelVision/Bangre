import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { getStudentDetail } from "@/lib/queries";
import { formatAmount, formatDate, ageFromBirthDate } from "@/lib/format";
import { Avatar, Badge, Card, ProgressBar } from "@/components/ui";
import { ReminderButton } from "./reminder-button";
import { PayButton } from "@/components/pay-button";

const trancheTone = { paid: "success", late: "danger", partial: "gold", pending: "neutral" } as const;
const trancheLabel = { paid: "Payée", late: "En retard", partial: "Partielle", pending: "En attente" } as const;

export default async function StudentDetailPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { schoolId } = await verifySession();
  const data = await getStudentDetail(schoolId, studentId);
  if (!data) notFound();
  const { student, summary } = data;

  const initials = `${student.lastName.charAt(0)}${student.firstName.charAt(0)}`.toUpperCase();
  const age = ageFromBirthDate(student.birthDate);

  return (
    <div>
      <div className="border-b border-(--color-border) flex flex-col lg:flex-row lg:items-center gap-3 px-4 lg:px-7 py-3.5 lg:py-0 lg:h-[70px]">
        <div className="min-w-0">
          <div className="text-[12.5px] text-(--color-text-muted)">
            <Link href="/classes" className="text-(--color-primary) font-medium">
              Classes
            </Link>{" "}
            ›{" "}
            <Link href={`/classes/${student.classId}/eleves`} className="text-(--color-primary) font-medium">
              {student.class.name}
            </Link>{" "}
            › Fiche élève
          </div>
          <div className="text-[19px] font-semibold tracking-tight mt-0.5">
            {student.lastName} {student.firstName}{" "}
            <span className="text-[14px] text-(--color-text-muted) font-normal">· {student.matricule}</span>
          </div>
        </div>
        <div className="hidden lg:block lg:flex-1" />
        <div className="flex items-center gap-2.5 flex-wrap">
          <ReminderButton studentId={student.id} />
          <PayButton
            studentId={student.id}
            hint={`${student.lastName} ${student.firstName} · ${student.class.name} · ${student.matricule}`}
            className="h-[38px] rounded-[9px] bg-(--color-primary) text-white flex items-center px-4 text-[13.5px] font-semibold hover:bg-(--color-primary-hover)"
          >
            + Enregistrer un paiement
          </PayButton>
        </div>
      </div>

      <div className="p-4 lg:p-5.5 lg:px-7 pb-10 grid gap-3.5 items-start grid-cols-1 xl:grid-cols-[320px_1fr]">
        <div className="grid gap-3.5">
          <Card>
            <div className="flex items-center gap-3.5">
              <Avatar initials={initials} />
              <div>
                <div className="text-[16px] font-semibold">
                  {student.lastName} {student.firstName}
                </div>
                <div className="text-[13px] text-(--color-text-muted)">
                  {student.class.name}
                  {age !== null ? ` · ${age} ans` : ""}
                </div>
              </div>
            </div>
            <div className="grid gap-2.5 mt-4.5">
              <Row label="Matricule" value={student.matricule} mono />
              <Row label="Né le" value={formatDate(student.birthDate)} mono />
              <Row label="Sexe" value={student.gender === "F" ? "Féminin" : "Masculin"} />
              <Row label="Parent / tuteur" value={student.parentName ?? "—"} />
              <Row label="Téléphone" value={student.parentPhone ?? "—"} mono />
              <div className="flex justify-between items-center text-[13.5px]">
                <span className="text-(--color-text-muted)">WhatsApp</span>
                <Badge tone={student.whatsappStatus === "reachable" ? "success" : student.whatsappStatus === "unreachable" ? "gold" : "danger"}>
                  {student.whatsappStatus === "reachable"
                    ? "Joignable"
                    : student.whatsappStatus === "unreachable"
                      ? "Non lu"
                      : student.whatsappStatus === "invalid"
                        ? "Numéro invalide"
                        : "Inconnu"}
                </Badge>
              </div>
            </div>
            <Link
              href={`/eleves/${student.id}/modifier`}
              className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-(--color-bg-subtle) flex items-center justify-center text-[13px] font-semibold mt-4.5 no-underline hover:no-underline"
            >
              Modifier la fiche
            </Link>
          </Card>

          {summary.status !== "non_defini" ? (
            <Card>
              <div className="text-[15px] font-semibold">État du paiement</div>
              <div className="flex justify-between items-baseline mt-3.5">
                <span className="text-[13px] text-(--color-text-muted)">Payé</span>
                <b className="text-[19px] text-(--color-success-text) tabular-nums">{formatAmount(summary.paid)}</b>
              </div>
              <div className="flex justify-between items-baseline mt-1.5">
                <span className="text-[13px] text-(--color-text-muted)">Restant</span>
                <b className="text-[19px] text-(--color-danger-text) tabular-nums">{formatAmount(summary.remaining)}</b>
              </div>
              <div className="mt-3.5">
                <ProgressBar percent={summary.percent} height={10} />
              </div>
              <div className="text-[12.5px] text-(--color-text-muted) mt-2">
                {summary.percent}% de {formatAmount(summary.total)} CFA
              </div>
            </Card>
          ) : (
            <Card className="border-(--color-gold-border) bg-(--color-gold-bg)">
              <div className="text-[13px] text-(--color-gold-text) leading-relaxed">
                La scolarité de la {student.class.name} n&apos;est pas encore configurée.{" "}
                <Link href={`/classes/${student.classId}/configuration`} className="font-semibold">
                  Configurer maintenant
                </Link>
              </div>
            </Card>
          )}
        </div>

        <div className="grid gap-3.5">
          {summary.trancheStates.length > 0 && (
            <Card>
              <div className="text-[15px] font-semibold mb-3">Détail par tranche</div>
              <div className="grid gap-2.5">
                {summary.trancheStates.map((ts) => (
                  <div
                    key={ts.tranche.id}
                    className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[11px] px-4 py-3.5 border"
                    style={{
                      borderColor:
                        ts.status === "paid" ? "var(--color-success-border)" : ts.status === "late" ? "var(--color-danger-border)" : "var(--color-border)",
                      background: ts.status === "paid" ? "var(--color-success-bg-soft)" : ts.status === "late" ? "var(--color-danger-bg-soft)" : "var(--color-bg-subtle)",
                    }}
                  >
                    <div className="flex-1 min-w-[150px]">
                      <div className="text-[14.5px] font-semibold">{ts.tranche.label}</div>
                      <div
                        className="text-[12.5px] mt-0.5"
                        style={{ color: ts.status === "late" ? "var(--color-danger-text)" : "var(--color-text-muted)" }}
                      >
                        Échéance {formatDate(ts.tranche.dueDate)}
                        {ts.status === "late" ? ` · ${ts.daysLate} jour${ts.daysLate > 1 ? "s" : ""} de retard` : ""}
                      </div>
                    </div>
                    <div className="text-[15px] font-semibold tabular-nums">{formatAmount(ts.tranche.amount)}</div>
                    <Badge tone={trancheTone[ts.status]}>{trancheLabel[ts.status]}</Badge>
                    {ts.status !== "paid" ? (
                      <PayButton
                        studentId={student.id}
                        trancheId={ts.tranche.id}
                        hint={`${student.lastName} ${student.firstName} · ${student.class.name} · ${student.matricule}`}
                        className={`h-8 rounded-lg flex items-center px-3.5 text-[12.5px] font-semibold ${
                          ts.status === "late" ? "bg-(--color-primary) text-white" : "border border-(--color-border-strong) bg-white"
                        }`}
                      >
                        Encaisser
                      </PayButton>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid gap-3.5 grid-cols-1 lg:grid-cols-[1.3fr_1fr]">
            <Card>
              <div className="text-[15px] font-semibold mb-2">Historique des paiements</div>
              {student.payments.length === 0 && (
                <div className="text-[13px] text-(--color-text-muted) py-3">Aucun paiement enregistré.</div>
              )}
              {student.payments.map((p) => (
                <div key={p.id} className="flex justify-between items-center py-2.5 border-b border-(--color-border-row) last:border-b-0">
                  <div>
                    <div className="text-[13.5px] font-medium">
                      {formatDate(p.date)} ·{" "}
                      {p.allocations.map((a) => a.tranche.label).join(", ") || "Paiement libre"}
                    </div>
                    <div className="text-xs text-(--color-text-muted)">
                      {p.method === "cash" ? "Espèces" : p.method} · reçu N° {String(p.receiptNumber).padStart(4, "0")}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <b className="text-sm tabular-nums">{formatAmount(p.amount)}</b>
                    <a
                      href={`/api/receipts/${p.id}/pdf`}
                      target="_blank"
                      className="text-[12.5px] text-(--color-primary) font-semibold"
                    >
                      PDF
                    </a>
                  </div>
                </div>
              ))}
            </Card>

            <Card>
              <div className="text-[15px] font-semibold mb-2.5">Rappels envoyés</div>
              {student.reminders.length === 0 && (
                <div className="text-[13px] text-(--color-text-muted) py-2">Aucun rappel envoyé.</div>
              )}
              {student.reminders.slice(0, 6).map((r) => (
                <div key={r.id} className="flex justify-between items-center text-[13.5px] py-1.5">
                  <span>{formatDate(r.sentAt)}</span>
                  <Badge tone="gold">Envoyé</Badge>
                </div>
              ))}
              <ReminderButton studentId={student.id} label="Rappel manuel" className="w-full mt-3.5" />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-[13.5px]">
      <span className="text-(--color-text-muted)">{label}</span>
      <b className={mono ? "tabular-nums" : ""}>{value}</b>
    </div>
  );
}
