import Link from "next/link";
import type { UniformsOverview, UniformVue } from "@/lib/uniforms-overview";
import { formatAmount, formatDate } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ListFilters } from "@/components/list-filters";
import { UniformSaleButton } from "@/components/uniforms/uniform-sale-button";
import { UniformCancelButton, UniformDeliverButton } from "@/components/uniforms/uniform-actions";
import { cn } from "@/lib/cn";

const primaryAction =
  "h-[38px] rounded-[9px] bg-(--color-primary) text-white flex items-center px-4 text-[13.5px] font-semibold hover:bg-(--color-primary-hover)";
const secondaryAction =
  "h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline";

/**
 * Tenues: sales, what is still to hand over, and the stock. The same screen
 * online and offline; the catalogue and the receipts PDF are made online.
 */
export function UniformsView({
  data,
  offline = false,
  onNavigate,
}: {
  data: UniformsOverview;
  offline?: boolean;
  onNavigate?: (href: string) => void;
}) {
  if (!data.enabled || !data.hasCatalog) {
    return (
      <div>
        <PageHeader title="Tenues" subtitle="Option de l'établissement" />
        <div className="p-4 lg:p-7">
          <Card className="max-w-[560px]">
            <div className="text-[16px] font-semibold">
              {data.enabled ? "Catalogue des tenues à remplir" : "Les tenues ne sont pas activées"}
            </div>
            <p className="text-[13.5px] text-(--color-text-secondary) leading-relaxed mt-2">
              Indiquez les tenues que vend l&apos;établissement (tenue scolaire, tenue de sport…), leurs tailles, leurs
              prix et, si vous le souhaitez, le stock. Chaque vente est payée en une fois, avec un reçu, et vous suivez
              les tenues restant à remettre.
            </p>
            {offline ? (
              <p className="text-[13px] text-(--color-gold-text) mt-4">Le catalogue se règle en ligne, au retour du réseau.</p>
            ) : (
              <Link href="/tenues/reglages" className={cn(primaryAction, "inline-flex mt-4 no-underline hover:no-underline")}>
                Remplir le catalogue
              </Link>
            )}
          </Card>
        </div>
      </div>
    );
  }

  const tabs: { vue: UniformVue; label: string; count?: number; tone?: "gold" | "danger" }[] = [
    { vue: "ventes", label: "Ventes & reçus" },
    { vue: "a-remettre", label: "À remettre", count: data.stats.toDeliver, tone: "gold" },
    { vue: "stock", label: "Catalogue & stock", count: data.stats.outOfStock || undefined, tone: "danger" },
  ];
  const query = (overrides: Record<string, string | undefined>) => {
    const merged = { vue: data.vue === "ventes" ? undefined : data.vue, ...data.filters, ...overrides };
    const params = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
    const text = params.toString();
    return text ? `/tenues?${text}` : "/tenues";
  };

  return (
    <div>
      <PageHeader
        title="Tenues"
        subtitle={`${data.yearLabel} · paiement en une fois`}
        actions={
          <>
            {!offline && (
              <Link href="/tenues/reglages" className={secondaryAction}>
                Catalogue
              </Link>
            )}
            <UniformSaleButton students={data.sellable} className={primaryAction}>
              + Vente de tenues
            </UniformSaleButton>
          </>
        }
      />

      <div className="p-4 lg:p-5 lg:px-7 pb-10 grid gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5">
          <Stat
            label="Encaissé ce mois-ci"
            value={formatAmount(data.stats.monthCollected)}
            hint={`CFA · ${data.stats.monthReceipts} reçus${data.stats.offlineCount ? ` · ${data.stats.offlineCount} hors ligne` : ""}`}
          />
          <Stat label="À remettre" value={String(data.stats.toDeliver)} hint="tenues payées, pas encore remises" />
          <Stat
            label="Tailles épuisées"
            value={String(data.stats.outOfStock)}
            hint="parmi les tenues suivies en stock"
            danger={data.stats.outOfStock > 0}
          />
        </div>

        <div className="flex gap-1.5 border-b border-(--color-border) overflow-x-auto">
          {tabs.map((t) => (
            <Link
              key={t.vue}
              href={query({ vue: t.vue === "ventes" ? undefined : t.vue, page: undefined })}
              className={cn(
                "px-3.5 h-10 flex items-center gap-2 text-[13.5px] font-semibold no-underline hover:no-underline border-b-2 -mb-px whitespace-nowrap",
                data.vue === t.vue ? "border-(--color-primary) text-(--color-text)" : "border-transparent text-(--color-text-muted)"
              )}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span
                  className={cn(
                    "text-[11.5px] px-1.5 py-0.5 rounded-full tabular-nums",
                    t.tone === "danger"
                      ? "bg-(--color-danger-bg) text-(--color-danger-text)"
                      : "bg-(--color-gold-chip-bg) text-(--color-gold-text)"
                  )}
                >
                  {t.count}
                </span>
              )}
            </Link>
          ))}
        </div>

        {data.vue !== "stock" && (
          <ListFilters
            basePath="/tenues"
            currentParams={{ vue: data.vue === "ventes" ? undefined : data.vue, ...data.filters }}
            onNavigate={onNavigate}
            searchParam={{ name: "q", placeholder: "Nom, prénom ou matricule…", value: data.filters.q }}
            selects={[]}
          />
        )}

        {data.vue === "stock" ? <StockTable data={data} /> : <SalesTable data={data} offline={offline} />}

        {data.pageCount > 1 && data.vue !== "stock" && (
          <div className="flex gap-1.5 justify-end flex-wrap">
            {Array.from({ length: data.pageCount }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={query({ page: p === 1 ? undefined : String(p) })}
                className={`w-[30px] h-[30px] rounded-lg border flex items-center justify-center text-[12.5px] no-underline hover:no-underline ${
                  p === data.page ? "bg-[#221E1A] text-white border-[#221E1A]" : "border-(--color-border-strong) bg-white text-(--color-text)"
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

function Stat({ label, value, hint, danger }: { label: string; value: string; hint: string; danger?: boolean }) {
  return (
    <Card className={danger ? "border-(--color-danger-border)" : undefined}>
      <div className="text-[12.5px] text-(--color-text-muted)">{label}</div>
      <div className={cn("text-[24px] font-bold mt-1.5 tabular-nums", danger && "text-(--color-danger-text)")}>{value}</div>
      <div className="text-[12.5px] text-(--color-text-muted)">{hint}</div>
    </Card>
  );
}

function SalesTable({ data, offline }: { data: UniformsOverview; offline: boolean }) {
  return (
    <div className="bg-white border border-(--color-border) rounded-2xl overflow-x-auto">
      <table className="w-full" style={{ minWidth: 900 }}>
        <thead>
          <tr className="bg-(--color-bg-subtle)">
            <Th>Reçu</Th>
            <Th>Date</Th>
            <Th>Élève</Th>
            <Th>Tenues</Th>
            <Th align="right">Montant</Th>
            <Th>État</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {data.sales.map((s) => (
            <tr key={s.id} className={cn("border-t border-(--color-border-row) align-top", s.cancelled && "opacity-70")}>
              <Td className="font-semibold tabular-nums">
                {s.receiptNumber > 0 ? `N° ${String(s.receiptNumber).padStart(4, "0")}` : "—"}
              </Td>
              <Td className="tabular-nums">{formatDate(s.date)}</Td>
              <Td>
                <Link href={`/eleves/${s.studentId}`} className="text-(--color-text) no-underline hover:underline font-semibold">
                  {s.studentName}
                </Link>
                <span className="block text-[12px] text-(--color-text-muted)">{s.className}</span>
              </Td>
              <Td>
                {s.description}
                {s.cancelled && s.cancelReason && (
                  <span className="block text-[12px] text-(--color-danger-text)">Motif : {s.cancelReason}</span>
                )}
              </Td>
              <Td align="right" className={cn("font-semibold tabular-nums", s.cancelled && "line-through")}>
                {formatAmount(s.amount)}
              </Td>
              <td className="py-3 px-3">
                <div className="flex flex-col items-start gap-1">
                  {s.cancelled ? (
                    <Badge tone="danger">Annulée</Badge>
                  ) : s.toDeliver > 0 ? (
                    <Badge tone="gold">{s.toDeliver} à remettre</Badge>
                  ) : (
                    <Badge tone="success">Remise</Badge>
                  )}
                  {!s.synced && <Badge tone="gold">Hors ligne</Badge>}
                </div>
              </td>
              <td className="py-3 pr-4 text-right whitespace-nowrap">
                <div className="flex gap-1.5 justify-end items-center">
                  {!s.cancelled && (
                    <UniformDeliverButton lines={s.lines} label={s.studentName} disabled={!s.synced} />
                  )}
                  {s.canCancel && (
                    <UniformCancelButton
                      saleId={s.id}
                      label={`Reçu N° ${String(s.receiptNumber).padStart(4, "0")} · ${s.studentName} · ${formatAmount(s.amount)} CFA · ${s.description}`}
                    />
                  )}
                  {!offline && s.receiptNumber > 0 && (
                    <a href={`/api/tenues/recus/${s.id}/pdf`} target="_blank" className="text-[12.5px] text-(--color-primary) font-semibold ml-1">
                      PDF
                    </a>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {data.sales.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center text-(--color-text-muted) py-8 text-sm">
                {data.vue === "a-remettre"
                  ? "Toutes les tenues payées ont été remises."
                  : data.filters.q
                    ? "Aucune vente ne correspond."
                    : "Aucune vente de tenues cette année. Utilisez « Vente de tenues »."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StockTable({ data }: { data: UniformsOverview }) {
  return (
    <div className="grid gap-3">
      {data.catalog.map((item) => (
        <Card key={item.id}>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[15px] font-semibold">{item.name}</div>
            <span className="text-[12.5px] text-(--color-text-muted)">
              {item.levels.length ? item.levels.join(", ") : "Tous les niveaux"}
              {item.trackStock ? " · stock suivi" : " · sans suivi du stock"}
            </span>
          </div>
          <div className="overflow-x-auto mt-2.5">
            <table className="w-full text-[13.5px]" style={{ minWidth: 420 }}>
              <thead>
                <tr className="text-[11.5px] uppercase tracking-wider text-(--color-text-muted)">
                  <th className="text-left font-semibold py-1.5">Taille</th>
                  <th className="text-right font-semibold py-1.5">Prix</th>
                  <th className="text-right font-semibold py-1.5">Vendues cette année</th>
                  {item.trackStock && <th className="text-right font-semibold py-1.5">En stock</th>}
                </tr>
              </thead>
              <tbody>
                {item.variants.map((v) => (
                  <tr key={v.id} className="border-t border-(--color-border-row)">
                    <td className="py-2">{v.size || "Taille unique"}</td>
                    <td className="py-2 text-right tabular-nums">{formatAmount(v.price)} CFA</td>
                    <td className="py-2 text-right tabular-nums">{v.sold}</td>
                    {item.trackStock && (
                      <td className={cn("py-2 text-right tabular-nums font-semibold", v.stock <= 0 && "text-(--color-danger-text)")}>
                        {v.stock <= 0 ? `Épuisée${v.stock < 0 ? ` (${v.stock})` : ""}` : v.stock}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className="text-[11.5px] uppercase tracking-wider text-(--color-text-muted) py-3 px-3 font-semibold first:pl-4" style={{ textAlign: align }}>
      {children}
    </th>
  );
}

function Td({ children, align = "left", className = "" }: { children: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <td className={`py-3 px-3 text-[13.5px] first:pl-4 ${className}`} style={{ textAlign: align }}>
      {children}
    </td>
  );
}
