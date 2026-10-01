"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatAmount, formatCFA, formatDate, formatMethod } from "@/lib/format";
import { describeMonths, monthLabel, monthShortLabel, priceCanteenSelection, capitalize } from "@/lib/canteen";
import type { CanteenPaymentContext } from "@/lib/canteen-overview";
import { loadCanteenPaymentContext, submitCanteenPayment, type CanteenPaymentOutcome } from "@/lib/canteen-client";
import { DateInput } from "@/components/date-input";
import { cn } from "@/lib/cn";
import { serviceInfo, type SchoolService } from "@/lib/services";

/**
 * "Payer la cantine" (or the garde). Opens the payment window for one student,
 * or — from the service's page — with a search among the enrolled students first.
 */
export function CanteenPayButton({
  service,
  studentId,
  students,
  className,
  children,
}: {
  service: SchoolService;
  studentId?: string;
  /** Who the search offers when no student is given. */
  students?: { id: string; label: string }[];
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("cursor-pointer", className)}>
        {children}
      </button>
      {open && (
        <CanteenPaymentModal
          service={service}
          initialStudentId={studentId ?? null}
          students={students ?? []}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const fieldClass =
  "w-full h-[46px] border border-(--color-border-strong) rounded-[10px] px-3.5 text-[14.5px] bg-white focus:outline-none focus:border-(--color-primary)";

function CanteenPaymentModal({
  service,
  initialStudentId,
  students,
  onClose,
}: {
  service: SchoolService;
  initialStudentId: string | null;
  students: { id: string; label: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const info = serviceInfo(service);
  const [studentId, setStudentId] = useState<string | null>(initialStudentId);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<{ context: CanteenPaymentContext; local: boolean } | { error: string } | null>(null);
  const [annual, setAnnual] = useState(false);
  const [packageIds, setPackageIds] = useState<Set<string>>(new Set());
  const [months, setMonths] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("cash");
  const [receivedBy, setReceivedBy] = useState("");
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CanteenPaymentOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    void loadCanteenPaymentContext(studentId, service).then((res) => {
      if (cancelled) return;
      setLoaded(res);
      if ("context" in res) {
        setReceivedBy(res.context.receivedByDefault);
        // Start from what the family owes now: every late month and this month.
        setMonths(new Set(res.context.months.filter((m) => m.status === "late" || m.status === "due").map((m) => m.month)));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, service]);

  const context = loaded && "context" in loaded ? loaded.context : null;
  const isLocal = loaded && "context" in loaded ? loaded.local : false;

  const coveredByPackages = useMemo(() => {
    const set = new Set<string>();
    if (!context) return set;
    for (const p of context.pricing.packages) if (packageIds.has(p.id)) for (const m of p.months) set.add(m);
    return set;
  }, [context, packageIds]);

  const selection = { annual, packageIds: [...packageIds], months: [...months].filter((m) => !coveredByPackages.has(m)) };
  const quote = context ? priceCanteenSelection(context.pricing, selection) : null;
  const owed = new Set(context?.pricing.owed ?? []);

  function toggleMonth(month: string) {
    if (annual || coveredByPackages.has(month)) return;
    setMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  }

  function togglePackage(id: string) {
    if (!context) return;
    setAnnual(false);
    const pkg = context.pricing.packages.find((p) => p.id === id);
    setPackageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      // Two packages sharing a month cannot both be paid: the newer one wins.
      for (const other of context.pricing.packages) {
        if (next.has(other.id) && other.months.some((m) => pkg?.months.includes(m))) next.delete(other.id);
      }
      next.add(id);
      return next;
    });
  }

  function toggleAnnual() {
    setAnnual((prev) => !prev);
    setPackageIds(new Set());
  }

  function selectMonths(which: "late" | "all" | "none") {
    if (!context) return;
    setAnnual(false);
    setPackageIds(new Set());
    if (which === "none") setMonths(new Set());
    else if (which === "all") setMonths(new Set(context.pricing.owed));
    else setMonths(new Set(context.months.filter((m) => m.status === "late" || m.status === "due").map((m) => m.month)));
  }

  function submit() {
    if (!context || !quote?.ok) return;
    setError(null);
    startTransition(async () => {
      const res = await submitCanteenPayment(
        { service, studentId: context.student.id, selection, date, method, receivedBy, notifyWhatsapp },
        {
          amount: quote.amount,
          label: quote.label,
          studentName: `${context.student.lastName} ${context.student.firstName}`,
        }
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res);
      if (!("queued" in res)) router.refresh();
    });
  }

  const matches = query.trim()
    ? students.filter((s) => s.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  const receiptNumber = result && result.ok && !("queued" in result) ? result.receiptNumber : null;

  return (
    <div className="fixed inset-0 bg-[#281C14]/42 flex items-stretch sm:items-start justify-center p-0 sm:p-6 lg:p-8 z-50 overflow-auto overscroll-contain">
      <div className="flex flex-col lg:flex-row gap-0 sm:gap-4 items-stretch lg:items-start w-full sm:max-w-[1000px]">
        <div className="lg:flex-[1.3] lg:min-w-[420px] w-full min-h-[100dvh] sm:min-h-0 bg-(--color-bg-app) rounded-none sm:rounded-[18px] shadow-2xl overflow-hidden">
          <div className="px-4 sm:px-5.5 py-4 border-b border-(--color-border) flex items-center sticky top-0 bg-(--color-bg-app) z-10">
            <div className="min-w-0">
              <div className="text-[18px] font-semibold tracking-tight">Paiement de {info.the}</div>
              {context && (
                <div className="text-[13px] text-(--color-text-muted) mt-0.5 truncate">
                  {context.student.lastName} {context.student.firstName} · {context.student.className} ·{" "}
                  {context.student.matricule}
                </div>
              )}
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="w-8 h-8 rounded-[9px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[15px] text-(--color-text-mutedalt) cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="p-4 sm:p-5.5">
            {!studentId && (
              <div>
                <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-2">
                  Rechercher un élève inscrit à {info.the}
                </div>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nom, prénom ou matricule…"
                  className={fieldClass}
                />
                <div className="grid gap-1.5 mt-3">
                  {matches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setStudentId(m.id)}
                      className="text-left h-11 rounded-[10px] border border-(--color-border-strong) bg-white px-3.5 text-[13.5px] cursor-pointer hover:bg-(--color-bg-subtle)"
                    >
                      {m.label}
                    </button>
                  ))}
                  {query.trim() && matches.length === 0 && (
                    <div className="text-[13px] text-(--color-text-muted) py-2">
                      Aucun élève inscrit à {info.the} ne correspond. Inscrivez-le d&apos;abord depuis l&apos;onglet{" "}
                      {info.title}.
                    </div>
                  )}
                </div>
              </div>
            )}

            {studentId && !loaded && <div className="text-[13.5px] text-(--color-text-muted) py-6">Chargement…</div>}
            {loaded && "error" in loaded && (
              <div className="text-[13.5px] text-(--color-danger-text) py-4">{loaded.error}</div>
            )}

            {context && !result && (
              <>
                {isLocal && (
                  <div className="rounded-lg border border-(--color-gold-border) bg-(--color-gold-bg) text-(--color-gold-text) text-[12.5px] px-3.5 py-2.5 mb-4 leading-relaxed">
                    Hors ligne : mois affichés d&apos;après les données de cet appareil. Le paiement part au retour du
                    réseau, où le serveur le vérifie et le numérote.
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <div className="text-[12.5px] font-semibold text-(--color-text-secondary)">1 · Mois payés</div>
                  <div className="flex-1" />
                  <QuickButton onClick={() => selectMonths("late")}>Dus à ce jour</QuickButton>
                  <QuickButton onClick={() => selectMonths("all")}>Tout le reste</QuickButton>
                  <QuickButton onClick={() => selectMonths("none")}>Aucun</QuickButton>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {context.months.map((m) => {
                    const paid = m.status === "paid";
                    const selected = !paid && (annual || coveredByPackages.has(m.month) || months.has(m.month));
                    return (
                      <button
                        key={m.month}
                        type="button"
                        disabled={paid || !owed.has(m.month)}
                        onClick={() => toggleMonth(m.month)}
                        title={capitalize(monthLabel(m.month))}
                        className={cn(
                          "h-[52px] rounded-[10px] px-2 text-left cursor-pointer disabled:cursor-default",
                          paid
                            ? "bg-(--color-success-bg) border border-transparent text-(--color-success-text)"
                            : m.status === "skipped"
                              ? "bg-(--color-bg-page) border border-dashed border-(--color-border-strong) text-(--color-text-placeholder)"
                              : selected
                              ? "bg-white border-[1.5px] border-(--color-primary)"
                              : "bg-white border border-(--color-border-strong)"
                        )}
                      >
                        <div className="text-[13px] font-semibold flex items-center gap-1">
                          {(paid || selected) && <span className={paid ? "" : "text-(--color-primary)"}>✓</span>}
                          {monthShortLabel(m.month)} {m.month.slice(0, 4)}
                        </div>
                        <div
                          className={cn(
                            "text-[11px]",
                            paid
                              ? "text-(--color-success-text)"
                              : m.status === "late"
                                ? "text-(--color-danger-text)"
                                : "text-(--color-text-muted)"
                          )}
                        >
                          {paid
                            ? "Payé"
                            : m.status === "skipped"
                              ? capitalize(info.without)
                              : m.status === "late"
                                ? "En retard"
                                : m.status === "due"
                                  ? "Ce mois-ci"
                                  : "À venir"}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="text-[12px] text-(--color-text-muted) mt-1.5">
                  {formatAmount(context.pricing.monthlyPrice)} CFA par mois payé à l&apos;unité.
                </div>

                {(context.annualAvailable || context.pricing.packages.length > 0) && (
                  <>
                    <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mt-4.5 mb-2">
                      Ou un tarif groupé
                    </div>
                    <div className="grid gap-2">
                      {context.annualAvailable && (
                        <OptionCard
                          active={annual}
                          onClick={toggleAnnual}
                          title="Année complète"
                          detail={describeMonths(context.pricing.allMonths)}
                          price={context.pricing.annualPrice ?? 0}
                          saving={context.pricing.monthlyPrice * context.pricing.allMonths.length - (context.pricing.annualPrice ?? 0)}
                        />
                      )}
                      {context.pricing.packages.map((p) => (
                        <OptionCard
                          key={p.id}
                          active={packageIds.has(p.id)}
                          onClick={() => togglePackage(p.id)}
                          title={p.label}
                          detail={describeMonths(p.months)}
                          price={p.price}
                          saving={context.pricing.monthlyPrice * p.months.length - p.price}
                        />
                      ))}
                    </div>
                  </>
                )}

                <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mt-4.5 mb-2">2 · Encaissement</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Montant (CFA)</div>
                    <div className="w-full h-[46px] border-[1.5px] border-(--color-primary) rounded-[10px] px-3.5 text-[18px] font-bold tabular-nums flex items-center bg-white">
                      {formatAmount(quote?.ok ? quote.amount : 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Date du paiement</div>
                    <DateInput value={date} onValueChange={setDate} />
                  </div>
                  <div>
                    <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Mode</div>
                    <select value={method} onChange={(e) => setMethod(e.target.value)} className={fieldClass}>
                      <option value="cash">Espèces</option>
                      <option value="mobile_money">Mobile Money</option>
                      <option value="bank">Virement bancaire</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Reçu par</div>
                    <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} className={fieldClass} />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-[13px] cursor-pointer mt-4">
                  <input
                    type="checkbox"
                    checked={notifyWhatsapp}
                    onChange={(e) => setNotifyWhatsapp(e.target.checked)}
                    className="w-4 h-4 accent-(--color-primary)"
                  />
                  Notifier le parent sur WhatsApp
                </label>

                {quote && !quote.ok && (annual || packageIds.size > 0 || months.size > 0) && (
                  <div className="text-[13px] text-(--color-danger-text) mt-3">{quote.error}</div>
                )}
                {error && <div className="text-[13px] text-(--color-danger-text) mt-3">{error}</div>}

                <div className="flex gap-2.5 mt-4.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 h-[46px] rounded-[10px] border border-(--color-border-strong) bg-white text-[14.5px] font-semibold cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={pending || !quote?.ok}
                    className="flex-[1.5] h-[46px] rounded-[10px] bg-(--color-primary) text-white text-[14.5px] font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {pending ? "Enregistrement…" : "Valider et générer le reçu"}
                  </button>
                </div>
              </>
            )}

            {result && result.ok && (
              <div className="py-4">
                <div className="text-[15px] font-semibold text-(--color-success-text)">
                  {"queued" in result ? "Paiement enregistré hors ligne" : "Paiement enregistré"}
                </div>
                <div className="text-[13.5px] text-(--color-text-muted) mt-1.5">
                  {"queued" in result
                    ? "Il sera synchronisé et numéroté dès le retour de la connexion."
                    : `Reçu N° ${String(result.receiptNumber).padStart(4, "0")} · ${formatCFA(result.amount)} · ${result.label}`}
                </div>
                <div className="flex flex-wrap gap-2.5 mt-4">
                  {!("queued" in result) && (
                    <a
                      href={`/api/cantine/recus/${result.paymentId}/pdf`}
                      target="_blank"
                      className="flex-1 h-[42px] rounded-[10px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[13.5px] font-semibold no-underline hover:no-underline"
                    >
                      Ouvrir le reçu PDF
                    </a>
                  )}
                  {result.whatsappUrl && (
                    <a
                      href={result.whatsappUrl}
                      target="_blank"
                      className="flex-1 h-[42px] rounded-[10px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[13.5px] font-semibold no-underline hover:no-underline"
                    >
                      Confirmer par WhatsApp
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 h-[42px] rounded-[10px] bg-(--color-primary) text-white text-[13.5px] font-semibold cursor-pointer"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {context && (
          <div className="w-full lg:w-[300px] lg:flex-1 bg-white rounded-none sm:rounded-[18px] shadow-2xl p-4 sm:p-5.5">
            <div className="text-center border-b border-dashed border-(--color-border-strong) pb-3.5">
              <div className="text-xs tracking-wider uppercase text-(--color-text-muted)">Reçu · {info.title}</div>
              <div className="text-[15px] font-semibold mt-1.5">{context.schoolName}</div>
              <div className="text-[12.5px] text-(--color-text-muted) mt-0.5 tabular-nums">
                N° {String(receiptNumber ?? context.nextReceiptNumber).padStart(4, "0")} · {formatDate(date)}
              </div>
            </div>
            <div className="grid gap-2 mt-3.5 text-[13px]">
              <ReceiptLine label="Élève" value={`${context.student.lastName} ${context.student.firstName}`} />
              <ReceiptLine label="Classe" value={context.student.className} />
              <ReceiptLine label="Objet" value={quote?.ok ? quote.label : "—"} />
              <ReceiptLine label="Mode" value={formatMethod(method)} />
            </div>
            <div className="border-t border-dashed border-(--color-border-strong) mt-3.5 pt-3.5 flex justify-between items-baseline">
              <span className="text-[13px] text-(--color-text-muted)">Montant</span>
              <b className="text-[20px] tabular-nums">{formatCFA(quote?.ok ? quote.amount : 0)}</b>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReceiptLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-(--color-text-muted) shrink-0">{label}</span>
      <b className="text-right">{value}</b>
    </div>
  );
}

function QuickButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 rounded-lg border border-(--color-border-strong) bg-white px-2.5 text-[12px] font-semibold cursor-pointer hover:bg-(--color-bg-subtle)"
    >
      {children}
    </button>
  );
}

function OptionCard({
  active,
  onClick,
  title,
  detail,
  price,
  saving,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  detail: string;
  price: number;
  saving: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-[11px] px-3.5 py-3 text-left cursor-pointer bg-white",
        active ? "border-[1.5px] border-(--color-primary)" : "border border-(--color-border-strong)"
      )}
    >
      <span
        className="w-[19px] h-[19px] rounded-[6px] flex items-center justify-center text-[12px] shrink-0"
        style={{
          background: active ? "var(--color-primary)" : "#fff",
          color: active ? "#fff" : "transparent",
          border: active ? "none" : "1.5px solid #C9C1B5",
        }}
      >
        ✓
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-semibold">{title}</div>
        <div className="text-[12.5px] text-(--color-text-muted)">
          {capitalize(detail)}
          {saving > 0 ? ` · ${formatAmount(saving)} CFA d'économie` : ""}
        </div>
      </div>
      <b className="text-[15px] tabular-nums whitespace-nowrap">{formatAmount(price)}</b>
    </button>
  );
}
