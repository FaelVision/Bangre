"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveCanteenSettingsAction, type CanteenSettingsState } from "@/lib/actions/canteen";
import { isNetworkError, withNetwork } from "@/lib/connectivity";
import { capitalize, describeMonths, monthLabel, monthRange, monthShortLabel } from "@/lib/canteen";
import { formatAmount } from "@/lib/format";
import { Field, Label, Select, TextInput } from "@/components/form";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { levelsNotice, serviceInfo, type SchoolService } from "@/lib/services";

type PackageRow = { label: string; price: string; months: string[] };

export type CanteenSettingsValues = {
  monthlyPrice: string;
  annualPrice: string;
  firstMonth: string;
  lastMonth: string;
  dueDay: string;
  packages: PackageRow[];
};

/** The prices, months and packages of the canteen or of the garde d'enfants. */
export function CanteenSettingsForm({
  service,
  enabled: initiallyEnabled,
  hasPlan,
  yearLabel,
  yearMonths,
  initial,
}: {
  service: SchoolService;
  enabled: boolean;
  hasPlan: boolean;
  yearLabel: string;
  /** The months the service may run on this academic year. */
  yearMonths: string[];
  initial: CanteenSettingsValues;
}) {
  const info = serviceInfo(service);
  const notice = levelsNotice(service);
  // Saved online only, like a class configuration: without a network the form
  // says so rather than losing what was typed.
  const [state, formAction, pending] = useActionState(
    async (previous: CanteenSettingsState, formData: FormData): Promise<CanteenSettingsState> => {
      try {
        return await withNetwork(() => saveCanteenSettingsAction(previous, formData), 20000);
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        return {
          error: `Pas de connexion : les réglages de ${info.the} s'enregistrent en ligne. Réessayez au retour du réseau.`,
        };
      }
    },
    undefined
  );

  const [enabled, setEnabled] = useState(initiallyEnabled || !hasPlan);
  const [monthlyPrice, setMonthlyPrice] = useState(initial.monthlyPrice);
  const [annualPrice, setAnnualPrice] = useState(initial.annualPrice);
  const [firstMonth, setFirstMonth] = useState(initial.firstMonth);
  const [lastMonth, setLastMonth] = useState(initial.lastMonth);
  const [packages, setPackages] = useState<PackageRow[]>(initial.packages);

  const period = firstMonth <= lastMonth ? monthRange(firstMonth, lastMonth) : [];
  const monthly = Number(monthlyPrice) || 0;
  const fullYear = monthly * period.length;
  const annual = Number(annualPrice) || 0;

  function updatePackage(i: number, patch: Partial<PackageRow>) {
    setPackages((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function togglePackageMonth(i: number, month: string) {
    setPackages((prev) =>
      prev.map((p, idx) =>
        idx === i
          ? { ...p, months: p.months.includes(month) ? p.months.filter((m) => m !== month) : [...p.months, month].sort() }
          : p
      )
    );
  }

  /** Three-month packages over the period — the usual "trimestre" — priced at the monthly rate to start with. */
  function addQuarters() {
    const rows: PackageRow[] = [];
    for (let i = 0; i < period.length; i += 3) {
      const months = period.slice(i, i + 3);
      if (months.length < 2) break;
      rows.push({ label: `${rows.length + 1}${rows.length === 0 ? "er" : "e"} trimestre`, price: String(monthly * months.length || ""), months });
    }
    setPackages((prev) => [...prev, ...rows]);
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="service" value={service} />
      <div className="border-b border-(--color-border) flex flex-col lg:flex-row lg:items-center gap-3 px-4 lg:px-7 py-3.5 lg:py-0 lg:h-[70px] lg:sticky lg:top-0 bg-(--color-bg-app) lg:z-10">
        <div className="min-w-0">
          <div className="text-[12.5px] text-(--color-text-muted)">
            <Link href={info.path} className="text-(--color-primary) font-medium">
              {info.title}
            </Link>{" "}
            › Réglages
          </div>
          <div className="text-[19px] font-semibold tracking-tight mt-0.5">Réglages de {info.the} · {yearLabel}</div>
        </div>
        <div className="hidden lg:block lg:flex-1" />
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href={info.path}
            className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline"
          >
            Retour
          </Link>
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>

      <div className="p-4 lg:p-7 grid gap-4 max-w-[820px]">
        {state?.error && (
          <div role="alert" className="rounded-[11px] border border-(--color-danger-border) bg-(--color-danger-bg-soft) text-(--color-danger-text) text-[13.5px] px-4 py-3">
            {state.error}
          </div>
        )}
        {state?.saved && (
          <div className="rounded-[11px] border border-(--color-success-border) bg-(--color-success-bg-soft) text-[13.5px] px-4 py-3 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-(--color-success-text-dark)">Réglages enregistrés.</span>
            <Link href={info.path} className="text-(--color-primary) font-semibold">
              {enabled ? `Aller à ${info.the} →` : "Retour →"}
            </Link>
          </div>
        )}

        <Card>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-[18px] h-[18px] mt-0.5 accent-(--color-primary)"
            />
            <span>
              <span className="block text-[14.5px] font-semibold">
                {service === "daycare"
                  ? "L'établissement propose la garde des enfants"
                  : "L'établissement propose une cantine"}
              </span>
              <span className="block text-[12.5px] text-(--color-text-muted) mt-0.5 leading-relaxed">
                {notice ? `${notice} ` : ""}Désactivée, {info.the} disparaît des encaissements ; les inscriptions et
                les paiements déjà enregistrés sont conservés pour le jour où vous la réactivez.
              </span>
            </span>
          </label>
        </Card>

        {enabled && (
          <>
            <Card>
              <div className="text-[15px] font-semibold">Tarifs</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-3.5">
                <Field>
                  <Label>Prix mensuel (CFA)</Label>
                  <TextInput
                    name="monthlyPrice"
                    inputMode="numeric"
                    value={monthlyPrice}
                    onChange={(e) => setMonthlyPrice(e.target.value.replace(/\D/g, ""))}
                    placeholder="5000"
                    required
                  />
                </Field>
                <Field>
                  <Label>Prix pour toute l&apos;année (CFA, facultatif)</Label>
                  <TextInput
                    name="annualPrice"
                    inputMode="numeric"
                    value={annualPrice}
                    onChange={(e) => setAnnualPrice(e.target.value.replace(/\D/g, ""))}
                    placeholder={fullYear ? String(fullYear) : "40000"}
                  />
                </Field>
              </div>
              <p className="text-[12.5px] text-(--color-text-muted) mt-2.5 leading-relaxed">
                {period.length} mois de {info.noun}
                {monthly ? ` : ${formatAmount(fullYear)} CFA en payant mois par mois` : ""}
                {annual && fullYear
                  ? annual < fullYear
                    ? `, ${formatAmount(annual)} CFA payés d'un coup (${formatAmount(fullYear - annual)} CFA d'économie).`
                    : `, ${formatAmount(annual)} CFA payés d'un coup.`
                  : "."}{" "}
                Le prix annuel s&apos;applique aux élèves inscrits toute l&apos;année qui n&apos;ont encore payé aucun mois.
              </p>
            </Card>

            <Card>
              <div className="text-[15px] font-semibold">Période et échéance</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-3.5">
                <Field>
                  <Label>Premier mois</Label>
                  <Select name="firstMonth" value={firstMonth} onChange={(e) => setFirstMonth(e.target.value)}>
                    {yearMonths.map((m) => (
                      <option key={m} value={m}>
                        {capitalize(monthLabel(m))}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>Dernier mois</Label>
                  <Select name="lastMonth" value={lastMonth} onChange={(e) => setLastMonth(e.target.value)}>
                    {yearMonths.map((m) => (
                      <option key={m} value={m}>
                        {capitalize(monthLabel(m))}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>À payer avant le</Label>
                  <Select name="dueDay" defaultValue={initial.dueDay}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d === 1 ? "1er" : d} du mois
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <p className="text-[12.5px] text-(--color-text-muted) mt-2.5">
                Passé ce jour, un mois non payé apparaît dans les retards de {info.noun}.
              </p>
            </Card>

            <Card>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-[15px] font-semibold">Forfaits</div>
                <div className="flex-1" />
                <Button type="button" variant="secondary" size="sm" onClick={addQuarters} disabled={period.length < 2}>
                  + Trimestres
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPackages((prev) => [...prev, { label: "", price: "", months: [] }])}
                >
                  + Forfait
                </Button>
              </div>
              <p className="text-[12.5px] text-(--color-text-muted) mt-1.5 leading-relaxed">
                Un forfait est un prix pour plusieurs mois payés ensemble (un trimestre, un semestre…). À
                l&apos;encaissement, on peut choisir des mois à l&apos;unité, un forfait ou l&apos;année entière.
              </p>

              <div className="grid gap-3 mt-3.5">
                {packages.length === 0 && (
                  <div className="text-[13px] text-(--color-text-muted)">Aucun forfait : les mois se paient à l&apos;unité ou à l&apos;année.</div>
                )}
                {packages.map((p, i) => {
                  const inPeriod = p.months.filter((m) => period.includes(m));
                  const atMonthly = monthly * inPeriod.length;
                  return (
                    <div key={i} className="rounded-[12px] border border-(--color-border-strong) p-3.5">
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-2.5 items-end">
                        <Field>
                          <Label>Nom du forfait</Label>
                          <TextInput value={p.label} onChange={(e) => updatePackage(i, { label: e.target.value })} placeholder="1er trimestre" />
                        </Field>
                        <Field>
                          <Label>Prix (CFA)</Label>
                          <TextInput
                            inputMode="numeric"
                            value={p.price}
                            onChange={(e) => updatePackage(i, { price: e.target.value.replace(/\D/g, "") })}
                          />
                        </Field>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-[46px]"
                          onClick={() => setPackages((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          Supprimer
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {period.map((m) => {
                          const on = p.months.includes(m);
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => togglePackageMonth(i, m)}
                              title={capitalize(monthLabel(m))}
                              className={cn(
                                "h-8 min-w-[52px] rounded-lg px-2 text-[12px] font-semibold cursor-pointer",
                                on
                                  ? "bg-(--color-primary) text-white"
                                  : "bg-white border border-(--color-border-strong) text-(--color-text-secondary)"
                              )}
                            >
                              {monthShortLabel(m)}
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-[12px] text-(--color-text-muted) mt-2">
                        {inPeriod.length === 0
                          ? "Choisissez les mois du forfait."
                          : `${capitalize(describeMonths(inPeriod))} · ${formatAmount(atMonthly)} CFA au prix mensuel${
                              Number(p.price) && Number(p.price) < atMonthly
                                ? ` · ${formatAmount(atMonthly - Number(p.price))} CFA d'économie`
                                : ""
                            }`}
                      </div>
                    </div>
                  );
                })}
              </div>
              <input
                type="hidden"
                name="packages"
                value={JSON.stringify(
                  packages.map((p) => ({ label: p.label, price: Number(p.price) || 0, months: p.months.filter((m) => period.includes(m)) }))
                )}
              />
            </Card>
          </>
        )}

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer les réglages"}
          </Button>
        </div>
      </div>
    </form>
  );
}
