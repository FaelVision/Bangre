import { formatAmount } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { ListFilters } from "@/components/list-filters";
import { LateTable, type LateRow } from "@/components/late-table";
import { SendAllRemindersButton } from "@/components/send-all-button";

export type LateViewFilters = { classe?: string; jours?: string; whatsapp?: string };

/**
 * Retards de paiement. Offline the exports step aside — they are rendered by
 * the server — but the list, the filters and the rappels WhatsApp all work
 * from the local copy.
 */
export function LateView({
  rows,
  classes,
  filters,
  reachableStudents,
  reachableCount,
  totalDue,
  offline = false,
  onNavigate,
}: {
  rows: LateRow[];
  classes: { id: string; name: string }[];
  filters: LateViewFilters;
  reachableStudents: { id: string; label: string }[];
  reachableCount: number;
  totalDue: number;
  offline?: boolean;
  onNavigate?: (href: string) => void;
}) {
  const { classe, jours, whatsapp } = filters;
  const whatsappFilter = whatsapp === "injoignable" || whatsapp === "reachable" ? whatsapp : undefined;
  const toCallCount = rows.length - reachableCount;
  const reminderSentCount = rows.filter((r) => r.lastReminder).length;

  // The PDF / Excel exports mirror exactly the filtered view on screen.
  const exportQuery = new URLSearchParams(
    Object.entries({ classe, jours, whatsapp: whatsappFilter }).filter(([, v]) => v) as [string, string][]
  ).toString();
  const exportSuffix = exportQuery ? `?${exportQuery}` : "";
  const toCallHref = `/retards?${new URLSearchParams(
    Object.entries({ classe, jours, whatsapp: "injoignable" }).filter(([, v]) => v) as [string, string][]
  ).toString()}`;

  return (
    <div>
      <PageHeader
        title="Retards de paiement"
        subtitle={`${rows.length} élèves · ${formatAmount(totalDue)} CFA dus`}
        actions={
          <>
            {!offline && (
              <>
                <a
                  href={`/api/retards/pdf${exportSuffix}`}
                  target="_blank"
                  className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline"
                >
                  Export PDF
                </a>
                <a
                  href={`/api/retards/csv${exportSuffix}`}
                  target="_blank"
                  className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline"
                >
                  Export Excel
                </a>
              </>
            )}
            <SendAllRemindersButton students={reachableStudents} />
          </>
        }
      />

      <div className="px-4 lg:px-7 pt-4.5 pb-10">
        <div className="flex gap-2.5 items-start mb-3.5 flex-wrap">
          <ListFilters
            basePath="/retards"
            currentParams={{ classe, jours, whatsapp }}
            onNavigate={onNavigate}
            selects={[
              {
                name: "classe",
                value: classe ?? "",
                options: [
                  { value: "", label: "Classe : toutes" },
                  ...classes.map((c) => ({ value: c.id, label: c.name })),
                ],
              },
              {
                name: "jours",
                value: jours ?? "",
                options: [
                  { value: "", label: "Retard : tous" },
                  { value: "7", label: "+ de 7 jours" },
                  { value: "15", label: "+ de 15 jours" },
                  { value: "30", label: "+ de 30 jours" },
                ],
              },
              {
                name: "whatsapp",
                value: whatsappFilter ?? "",
                options: [
                  { value: "", label: "WhatsApp : tous" },
                  { value: "injoignable", label: "Injoignables · à appeler" },
                  { value: "reachable", label: "Sur WhatsApp" },
                ],
              },
            ]}
          />
          <div className="flex-1" />
          <span className="h-8 rounded-full border border-(--color-success-border) bg-(--color-success-bg-soft) text-(--color-success-text) flex items-center gap-2 px-3.5 text-[12.5px] font-semibold">
            <span className="w-[7px] h-[7px] rounded-full bg-(--color-success-text)" /> Rappel envoyé ·{" "}
            {reminderSentCount}
          </span>
          <a
            href={toCallHref}
            className="h-8 rounded-full border border-(--color-danger-border) bg-(--color-danger-bg-soft) text-(--color-danger-text) flex items-center gap-2 px-3.5 text-[12.5px] font-semibold no-underline hover:no-underline"
            title="Voir uniquement les parents à appeler (injoignables sur WhatsApp)"
          >
            <span className="w-[7px] h-[7px] rounded-full bg-(--color-danger-text)" /> À appeler · {toCallCount}
          </a>
        </div>

        <LateTable rows={rows} offline={offline} />

        <div className="text-[12.5px] text-(--color-text-muted) mt-3">
          {whatsappFilter === "injoignable"
            ? "Liste des parents à appeler : élèves en retard dont le parent n'est pas joignable sur WhatsApp. Utilisez « Export PDF » / « Export Excel » pour la liste d'appels par classe."
            : "Les lignes concernant un parent injoignable sur WhatsApp passent dans la liste d'appels — filtrez par « WhatsApp : Injoignables » pour ne voir qu'elles."}
        </div>
      </div>
    </div>
  );
}
