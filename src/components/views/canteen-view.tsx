import Link from "next/link";
import { capitalize, describeMonths, monthRange } from "@/lib/canteen";
import type { CanteenEnrollCandidate, CanteenOverview, CanteenVue } from "@/lib/canteen-overview";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ListFilters } from "@/components/list-filters";
import { MonthChips, MonthLegend } from "@/components/canteen/month-chips";
import { CanteenPayButton } from "@/components/canteen/canteen-pay-button";
import { CanteenEnrollButton, CanteenLeaveButton } from "@/components/canteen/canteen-enrollment";
import { CanteenRemindersButton } from "@/components/canteen/canteen-reminders";
import { CanteenMonthsButton } from "@/components/canteen/canteen-months-button";
import { CanteenUndoButton } from "@/components/canteen/canteen-undo-button";
import { cn } from "@/lib/cn";
import { levelsNotice, serviceInfo } from "@/lib/services";

const primaryAction =
  "h-[38px] rounded-[9px] bg-(--color-primary) text-white flex items-center px-4 text-[13.5px] font-semibold hover:bg-(--color-primary-hover)";
const secondaryAction =
  "h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline";

/**
 * Cantine, and Garde d'enfants: one screen for both services, worded for the
 * one `data` is about. The same screen online and offline: the figures come
 * from `canteenOverview`, fed by the database or by the copy on the device.
 * Offline the receipt PDFs and the settings step aside — the server makes those.
 */
export function CanteenView({
  data,
  candidates,
  offline = false,
  onNavigate,
}: {
  data: CanteenOverview;
  candidates: CanteenEnrollCandidate[];
  offline?: boolean;
  onNavigate?: (href: string) => void;
}) {
  const plan = data.plan;
  const service = data.service;
  const info = serviceInfo(service);
  const notice = levelsNotice(service);

  if (!data.enabled || !plan) {
    return (
      <div>
        <PageHeader title={info.title} subtitle="Option de l'établissement" />
        <div className="p-4 lg:p-7">
          <Card className="max-w-[560px]">
            <div className="text-[16px] font-semibold">
              {data.enabled ? `Tarifs de ${info.the} à régler` : `${capitalize(info.the)} n'est pas activée`}
            </div>
            <p className="text-[13.5px] text-(--color-text-secondary) leading-relaxed mt-2">
              {service === "daycare"
                ? "Si votre établissement garde les enfants (avant ou après la classe, le midi…), Bangré suit ce paiement à part de la scolarité : vous inscrivez les enfants gardés, et leurs parents règlent au mois, sur plusieurs mois (forfaits) ou à l'année. La garde est réservée aux élèves de maternelle et du primaire."
                : "Si votre établissement propose une cantine, Bangré suit son paiement à part de la scolarité : vous inscrivez les élèves qui la prennent, et ils la règlent au mois, sur plusieurs mois (forfaits) ou à l'année. Les autres élèves ne sont pas concernés."}
            </p>
            <p className="text-[13.5px] text-(--color-text-secondary) leading-relaxed mt-2">
              Fixez d&apos;abord le prix mensuel, les mois d&apos;ouverture et, si vous le souhaitez, un prix annuel
              et des forfaits.
            </p>
            {offline ? (
              <p className="text-[13px] text-(--color-gold-text) mt-4">
                Les réglages de {info.the} se font en ligne, au retour du réseau.
              </p>
            ) : (
              <Link
                href={`${info.path}/reglages`}
                className={cn(primaryAction, "inline-flex mt-4 no-underline hover:no-underline")}
              >
                Activer et régler {info.the}
              </Link>
            )}
          </Card>
        </div>
      </div>
    );
  }

  const tabs: { vue: CanteenVue; label: string; count?: number }[] = [
    { vue: "inscrits", label: "Élèves inscrits", count: data.stats.enrolledCount },
    { vue: "retards", label: "Retards", count: data.stats.lateCount },
    { vue: "paiements", label: "Paiements & reçus" },
    { vue: "historique", label: "Historique" },
  ];
  const query = (overrides: Record<string, string | undefined>) => {
    const merged = { vue: data.vue === "inscrits" ? undefined : data.vue, ...data.filters, ...overrides };
    const params = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
    const text = params.toString();
    return text ? `${info.path}?${text}` : info.path;
  };

  return (
    <div>
      <PageHeader
        title={info.title}
        subtitle={`${data.yearLabel} · ${formatAmount(plan.monthlyPrice)} CFA / mois${
          plan.annualPrice ? ` · ${formatAmount(plan.annualPrice)} CFA l'année` : ""
        } · ${capitalize(describeMonths(monthRange(plan.firstMonth, plan.lastMonth)))}${notice ? ` · ${notice}` : ""}`}
        actions={
          <>
            {!offline && (
              <Link href={`${info.path}/reglages`} className={secondaryAction}>
                Réglages
              </Link>
            )}
            <CanteenEnrollButton
              service={service}
              candidates={candidates}
              firstMonth={plan.firstMonth}
              lastMonth={plan.lastMonth}
              currentMonth={data.currentMonth}
              className={secondaryAction}
            >
              + Inscrire des élèves
            </CanteenEnrollButton>
            <CanteenPayButton service={service} students={data.payable} className={primaryAction}>
              + Paiement {info.noun}
            </CanteenPayButton>
          </>
        }
      />

      <div className="p-4 lg:p-5 lg:px-7 pb-10 grid gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <Stat label="Élèves inscrits" value={String(data.stats.enrolledCount)} hint={info.enrolledHint} />
          <Stat label="À jour ce mois-ci" value={String(data.stats.upToDateCount)} hint="mois en cours réglé" tone="success" />
          <Stat
            label="En retard"
            value={String(data.stats.lateCount)}
            hint={`${formatAmount(data.stats.lateAmount)} CFA dus`}
            tone={data.stats.lateCount > 0 ? "danger" : undefined}
          />
          <Stat
            label="Encaissé ce mois-ci"
            value={formatAmount(data.stats.monthCollected)}
            hint={`CFA · ${data.stats.monthReceipts} reçus${data.stats.offlineCount ? ` · ${data.stats.offlineCount} hors ligne` : ""}`}
          />
        </div>

        <div className="flex gap-1.5 border-b border-(--color-border) overflow-x-auto">
          {tabs.map((t) => (
            <Link
              key={t.vue}
              href={query({ vue: t.vue === "inscrits" ? undefined : t.vue, page: undefined })}
              className={cn(
                "px-3.5 h-10 flex items-center gap-2 text-[13.5px] font-semibold no-underline hover:no-underline border-b-2 -mb-px whitespace-nowrap",
                data.vue === t.vue
                  ? "border-(--color-primary) text-(--color-text)"
                  : "border-transparent text-(--color-text-muted)"
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    "text-[11.5px] px-1.5 py-0.5 rounded-full tabular-nums",
                    t.vue === "retards" && t.count > 0
                      ? "bg-(--color-danger-bg) text-(--color-danger-text)"
                      : "bg-(--color-bg-page) text-(--color-text-mutedalt)"
                  )}
                >
                  {t.count}
                </span>
              )}
            </Link>
          ))}
        </div>

        {(data.vue === "inscrits" || data.vue === "retards") && (
          <div className="flex items-start gap-2.5 flex-wrap -mb-1">
            <ListFilters
              basePath={info.path}
              currentParams={{ vue: data.vue === "inscrits" ? undefined : data.vue, ...data.filters }}
              onNavigate={onNavigate}
              searchParam={{ name: "q", placeholder: "Nom, prénom ou matricule…", value: data.filters.q }}
              selects={[
                {
                  name: "classe",
                  value: data.filters.classe ?? "",
                  options: [{ value: "", label: "Classe : toutes" }, ...data.classes.map((c) => ({ value: c.id, label: c.name }))],
                },
              ]}
            />
            {data.vue === "retards" && (
              <>
                <div className="flex-1" />
                <CanteenRemindersButton service={service} students={data.reachableLate} />
              </>
            )}
          </div>
        )}

        {data.vue === "inscrits" && <EnrolledTable data={data} />}
        {data.vue === "retards" && <LateTable data={data} />}
        {data.vue === "paiements" && <PaymentsTable data={data} offline={offline} />}
        {data.vue === "historique" && <HistoryTable data={data} />}

        {(data.vue === "inscrits" || data.vue === "retards") && <MonthLegend service={service} />}

        {data.pageCount > 1 && (
          <div className="flex gap-1.5 justify-end flex-wrap">
            {Array.from({ length: data.pageCount }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={query({ page: p === 1 ? undefined : String(p) })}
                className={`w-[30px] h-[30px] rounded-lg border flex items-center justify-center text-[12.5px] no-underline hover:no-underline ${
                  p === data.page
                    ? "bg-[#221E1A] text-white border-[#221E1A]"
                    : "border-(--color-border-strong) bg-white text-(--color-text)"
                }`}
              >
                {p}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "success" | "danger" }) {
  return (
    <Card className={tone === "danger" ? "border-(--color-danger-border)" : undefined}>
      <div className="text-[12.5px] text-(--color-text-muted)">{label}</div>
      <div
        className={cn(
          "text-[24px] font-bold mt-1.5 tabular-nums whitespace-nowrap",
          tone === "danger" && "text-(--color-danger-text)",
          tone === "success" && "text-(--color-success-text)"
        )}
      >
        {value}
      </div>
      <div className="text-[12.5px] text-(--color-text-muted)">{hint}</div>
    </Card>
  );
}

function StudentCell({ student }: { student: CanteenOverview["rows"][number]["student"] }) {
  return (
    <Link href={`/eleves/${student.id}`} className="text-(--color-text) no-underline hover:underline font-semibold">
      {student.lastName} {student.firstName}
      <span className="block text-[12px] text-(--color-text-muted) font-normal">{student.matricule}</span>
    </Link>
  );
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center text-(--color-text-muted) py-8 text-sm">
        {children}
      </td>
    </tr>
  );
}

function EnrolledTable({ data }: { data: CanteenOverview }) {
  const plan = data.plan!;
  const service = data.service;
  const info = serviceInfo(service);
  return (
    <div className="bg-white border border-(--color-border) rounded-2xl overflow-x-auto">
      <table className="w-full" style={{ minWidth: 960 }}>
        <thead>
          <tr className="bg-(--color-bg-subtle)">
            <Th>Élève</Th>
            <Th>Classe</Th>
            <Th>Mois</Th>
            <Th>Situation</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.student.id} className="border-t border-(--color-border-row) align-top">
              <Td>
                <StudentCell student={r.student} />
              </Td>
              <Td>{r.student.class.name}</Td>
              <Td>
                <MonthChips service={service} months={r.summary.months} />
                <div className="text-[12px] text-(--color-text-muted) mt-1">
                  {r.summary.paidCount}/{r.summary.billableCount} mois payés
                  {r.summary.billableCount < r.summary.months.length
                    ? ` · ${r.summary.months.length - r.summary.billableCount} ${info.without}`
                    : ""}
                </div>
              </Td>
              <Td>
                {!r.enrolled ? (
                  <Badge tone="neutral">Sorti de {info.the}</Badge>
                ) : r.summary.status === "retard" ? (
                  <Badge tone="danger">{r.summary.statusLabel}</Badge>
                ) : (
                  <Badge tone="success">{r.summary.statusLabel}</Badge>
                )}
              </Td>
              <td className="py-3 pr-4 text-right">
                <div className="flex gap-1.5 justify-end flex-wrap">
                  {r.summary.paidCount < r.summary.billableCount && (
                    <CanteenPayButton
                      service={service}
                      studentId={r.student.id}
                      className="h-8 rounded-lg bg-(--color-primary) text-white px-2.5 text-[12px] font-semibold"
                    >
                      Payer
                    </CanteenPayButton>
                  )}
                  <CanteenMonthsButton
                    service={service}
                    student={{ id: r.student.id, label: `${r.student.lastName} ${r.student.firstName}` }}
                    months={r.summary.months}
                    enrollment={
                      r.openStartMonth
                        ? { startMonth: r.openStartMonth, firstMonth: plan.firstMonth, lastMonth: plan.lastMonth }
                        : null
                    }
                  />
                  {r.enrolled && (
                    <CanteenLeaveButton
                      service={service}
                      student={{ id: r.student.id, label: `${r.student.lastName} ${r.student.firstName}` }}
                      startMonth={r.openStartMonth ?? r.startMonth}
                      lastMonth={plan.lastMonth}
                      currentMonth={data.currentMonth}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
          {data.rows.length === 0 && (
            <EmptyRow colSpan={5}>
              {data.filters.q || data.filters.classe
                ? "Aucun élève inscrit ne correspond à ces filtres."
                : "Aucun élève inscrit pour l'instant. Utilisez « Inscrire des élèves »."}
            </EmptyRow>
          )}
        </tbody>
      </table>
    </div>
  );
}

function LateTable({ data }: { data: CanteenOverview }) {
  const service = data.service;
  return (
    <div className="bg-white border border-(--color-border) rounded-2xl overflow-x-auto">
      <table className="w-full" style={{ minWidth: 960 }}>
        <thead>
          <tr className="bg-(--color-bg-subtle)">
            <Th>Élève</Th>
            <Th>Classe</Th>
            <Th>Mois en retard</Th>
            <Th align="right">Montant dû</Th>
            <Th>Parent</Th>
            <Th>Dernier rappel</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.student.id} className="border-t border-(--color-border-row) align-top">
              <Td>
                <StudentCell student={r.student} />
              </Td>
              <Td>{r.student.class.name}</Td>
              <Td>{capitalize(describeMonths(r.summary.lateMonths))}</Td>
              <Td align="right" className="font-semibold tabular-nums text-(--color-danger-text)">
                {formatAmount(r.summary.lateAmount)}
              </Td>
              <Td>
                <div>{r.student.parentName ?? "—"}</div>
                <div className="text-[12px] text-(--color-text-muted)">
                  {r.student.parentPhone ?? "Aucun numéro"}
                  {r.student.parentPhone && r.student.whatsappStatus !== "reachable" ? " · à appeler" : ""}
                </div>
              </Td>
              <Td className="tabular-nums">{r.lastReminderAt ? formatDate(r.lastReminderAt) : "Aucun"}</Td>
              <td className="py-3 pr-4 text-right">
                <div className="flex gap-1.5 justify-end items-start flex-wrap">
                  {r.student.parentPhone && (
                    <CanteenRemindersButton service={service} students={[{ id: r.student.id, label: r.student.firstName }]} />
                  )}
                  <CanteenPayButton
                    service={service}
                    studentId={r.student.id}
                    className="h-8 rounded-lg bg-(--color-primary) text-white px-2.5 text-[12px] font-semibold"
                  >
                    Payer
                  </CanteenPayButton>
                </div>
              </td>
            </tr>
          ))}
          {data.rows.length === 0 && <EmptyRow colSpan={7}>Aucun retard de {serviceInfo(service).noun}. 🎉</EmptyRow>}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsTable({ data, offline }: { data: CanteenOverview; offline: boolean }) {
  return (
    <div className="bg-white border border-(--color-border) rounded-2xl overflow-x-auto">
      <table className="w-full" style={{ minWidth: 960 }}>
        <thead>
          <tr className="bg-(--color-bg-subtle)">
            <Th>Reçu</Th>
            <Th>Date</Th>
            <Th>Élève</Th>
            <Th>Classe</Th>
            <Th>Objet</Th>
            <Th align="right">Montant</Th>
            <Th>État</Th>
          </tr>
        </thead>
        <tbody>
          {data.payments.map((p) => (
            <tr key={p.id} className={cn("border-t border-(--color-border-row)", p.cancelled && "opacity-70")}>
              <Td className="font-semibold tabular-nums">
                {p.receiptNumber > 0 ? `N° ${String(p.receiptNumber).padStart(4, "0")}` : "—"}
              </Td>
              <Td className="tabular-nums">{formatDate(p.date)}</Td>
              <Td>
                <Link href={`/eleves/${p.studentId}`} className="text-(--color-text) no-underline hover:underline">
                  {p.studentName}
                </Link>
              </Td>
              <Td>{p.className}</Td>
              <Td>
                {p.label}
                {p.cancelled && p.cancelReason && (
                  <span className="block text-[12px] text-(--color-danger-text)">Motif : {p.cancelReason}</span>
                )}
              </Td>
              <Td align="right" className={cn("font-semibold tabular-nums", p.cancelled && "line-through")}>
                {formatAmount(p.amount)}
              </Td>
              <td className="py-3 px-3">
                {p.cancelled ? (
                  <Badge tone="danger">Annulé</Badge>
                ) : (
                  <Badge tone={p.synced ? "success" : "gold"}>{p.synced ? "Synchronisé" : "Hors ligne"}</Badge>
                )}
              </td>
              <td className="py-3 pr-4 text-right whitespace-nowrap">
                {!offline && p.undoActionId && (
                  <CanteenUndoButton
                    actionId={p.undoActionId}
                    isPayment
                    label={`Reçu N° ${String(p.receiptNumber).padStart(4, "0")} · ${p.studentName} · ${formatAmount(p.amount)} CFA · ${p.label}`}
                    className="mr-2.5"
                  />
                )}
                {!offline && p.receiptNumber > 0 && (
                  <a
                    href={`/api/cantine/recus/${p.id}/pdf`}
                    target="_blank"
                    className="text-[12.5px] text-(--color-primary) font-semibold"
                  >
                    PDF
                  </a>
                )}
              </td>
            </tr>
          ))}
          {data.payments.length === 0 && <EmptyRow colSpan={8}>Aucun paiement de {serviceInfo(data.service).noun} enregistré.</EmptyRow>}
        </tbody>
      </table>
    </div>
  );
}

const kindLabel: Record<string, string> = {
  payment: "Paiement",
  enroll: "Inscription",
  leave: "Sortie",
  skip: "Mois",
  start: "Début",
};

function HistoryTable({ data }: { data: CanteenOverview }) {
  if (!data.historyAvailable) {
    return (
      <Card className="border-(--color-gold-border) bg-(--color-gold-bg)">
        <div className="text-[13.5px] text-(--color-gold-text) leading-relaxed">
          L&apos;historique et les annulations sont disponibles au retour du réseau : ils sont conservés par le serveur.
        </div>
      </Card>
    );
  }
  return (
    <>
      <p className="text-[12.5px] text-(--color-text-muted) -mb-1">
        Toutes les opérations de {serviceInfo(data.service).the} des 30 derniers jours. Une erreur se corrige le jour même avec « Annuler » :
        tout redevient comme avant.
      </p>
      <div className="bg-white border border-(--color-border) rounded-2xl overflow-x-auto">
        <table className="w-full" style={{ minWidth: 900 }}>
          <thead>
            <tr className="bg-(--color-bg-subtle)">
              <Th>Date</Th>
              <Th>Élève</Th>
              <Th>Opération</Th>
              <Th>État</Th>
              <Th align="right">Correction</Th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((h) => (
              <tr key={h.id} className={cn("border-t border-(--color-border-row) align-top", h.undoneAt && "opacity-70")}>
                <Td className="tabular-nums whitespace-nowrap">{formatDateTime(h.createdAt)}</Td>
                <Td>
                  <Link href={`/eleves/${h.studentId}`} className="text-(--color-text) no-underline hover:underline font-semibold">
                    {h.studentName}
                  </Link>
                  <span className="block text-[12px] text-(--color-text-muted)">{h.className}</span>
                </Td>
                <Td>
                  <span className="text-[11px] uppercase tracking-wide text-(--color-text-muted) mr-1.5">
                    {kindLabel[h.kind] ?? h.kind}
                  </span>
                  <span className={cn(h.undoneAt && "line-through")}>{h.label}</span>
                </Td>
                <Td>
                  {h.undoneAt ? (
                    <>
                      <Badge tone="danger">Annulé</Badge>
                      <span className="block text-[12px] text-(--color-text-muted) mt-1">
                        {formatDateTime(h.undoneAt)}
                        {h.undoReason ? ` · ${h.undoReason}` : ""}
                      </span>
                    </>
                  ) : (
                    <Badge tone="success">Enregistré</Badge>
                  )}
                </Td>
                <td className="py-3 pr-4 text-right">
                  {h.canUndo ? (
                    <CanteenUndoButton actionId={h.id} label={`${h.studentName} · ${h.label}`} isPayment={h.kind === "payment"} />
                  ) : (
                    !h.undoneAt && (
                      <span className="text-[12px] text-(--color-text-placeholder)">Le jour même seulement</span>
                    )
                  )}
                </td>
              </tr>
            ))}
            {data.history.length === 0 && <EmptyRow colSpan={5}>Aucune opération ces 30 derniers jours.</EmptyRow>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="text-[11.5px] uppercase tracking-wider text-(--color-text-muted) py-3 px-3 font-semibold first:pl-4"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td className={`py-3 px-3 text-[13.5px] first:pl-4 ${className}`} style={{ textAlign: align }}>
      {children}
    </td>
  );
}
