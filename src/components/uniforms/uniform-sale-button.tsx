"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatAmount, formatCFA } from "@/lib/format";
import type { UniformSaleContext } from "@/lib/uniforms-overview";
import { loadUniformSaleContext, submitUniformSale, type UniformSaleOutcome } from "@/lib/uniforms-client";
import { DateInput } from "@/components/date-input";
import { cn } from "@/lib/cn";

/**
 * "Vente de tenue". Opens the sale window for one student, or — from the
 * Tenues page — with a search among the students first. Paid in full.
 */
export function UniformSaleButton({
  studentId,
  students,
  className,
  children,
}: {
  studentId?: string;
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
        <SaleModal initialStudentId={studentId ?? null} students={students ?? []} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

const fieldClass =
  "w-full h-[46px] border border-(--color-border-strong) rounded-[10px] px-3.5 text-[14.5px] bg-white focus:outline-none focus:border-(--color-primary)";

function SaleModal({
  initialStudentId,
  students,
  onClose,
}: {
  initialStudentId: string | null;
  students: { id: string; label: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState<string | null>(initialStudentId);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<{ context: UniformSaleContext; local: boolean } | { error: string } | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("cash");
  const [receivedBy, setReceivedBy] = useState("");
  const [delivered, setDelivered] = useState(true);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UniformSaleOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    void loadUniformSaleContext(studentId).then((res) => {
      if (cancelled) return;
      setLoaded(res);
      if ("context" in res) setReceivedBy(res.context.receivedByDefault);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const context = loaded && "context" in loaded ? loaded.context : null;
  const isLocal = loaded && "context" in loaded ? loaded.local : false;

  const chosen = context
    ? context.items.flatMap((item) =>
        item.variants
          .filter((v) => (quantities[v.id] ?? 0) > 0)
          .map((v) => ({
            variantId: v.id,
            label: v.size ? `${item.name} · ${v.size}` : item.name,
            quantity: quantities[v.id],
            amount: v.price * quantities[v.id],
          }))
      )
    : [];
  const total = chosen.reduce((s, l) => s + l.amount, 0);

  function change(variantId: string, delta: number, max: number | null) {
    setQuantities((prev) => {
      const next = Math.max(0, (prev[variantId] ?? 0) + delta);
      return { ...prev, [variantId]: max != null ? Math.min(next, max) : next };
    });
  }

  function submit() {
    if (!context || chosen.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await submitUniformSale(
        {
          studentId: context.student.id,
          cart: chosen.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          date,
          method,
          receivedBy,
          notifyWhatsapp,
          delivered,
        },
        { amount: total, studentName: `${context.student.lastName} ${context.student.firstName}` }
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

  return (
    <div className="fixed inset-0 bg-[#281C14]/42 flex items-stretch sm:items-start justify-center p-0 sm:p-6 lg:p-8 z-50 overflow-auto overscroll-contain">
      <div className="w-full sm:max-w-[640px] min-h-[100dvh] sm:min-h-0 bg-(--color-bg-app) rounded-none sm:rounded-[18px] shadow-2xl overflow-hidden">
        <div className="px-4 sm:px-5.5 py-4 border-b border-(--color-border) flex items-center sticky top-0 bg-(--color-bg-app) z-10">
          <div className="min-w-0">
            <div className="text-[18px] font-semibold tracking-tight">Vente de tenues</div>
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
              <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-2">Rechercher un élève</div>
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
                  <div className="text-[13px] text-(--color-text-muted) py-2">Aucun élève ne correspond.</div>
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
                  Hors ligne : catalogue et stock d&apos;après les données de cet appareil. La vente part au retour du
                  réseau, où le serveur la numérote.
                </div>
              )}

              <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-2">1 · Tenues</div>
              <div className="grid gap-2.5">
                {context.items.map((item) => (
                  <div key={item.id} className="rounded-[12px] border border-(--color-border-strong) bg-white p-3">
                    <div className="text-[14px] font-semibold mb-1.5">{item.name}</div>
                    <div className="grid gap-1.5">
                      {item.variants.map((v) => {
                        const qty = quantities[v.id] ?? 0;
                        const max = item.trackStock ? Math.max(0, v.stock) : null;
                        const soldOut = max === 0;
                        return (
                          <div key={v.id} className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <span className="text-[13.5px]">{v.size || "Taille unique"}</span>
                              <span className="text-[12.5px] text-(--color-text-muted)">
                                {" "}
                                · {formatAmount(v.price)} CFA
                                {item.trackStock && (
                                  <span className={soldOut ? "text-(--color-danger-text)" : ""}>
                                    {" "}
                                    · {soldOut ? "épuisée" : `${v.stock} en stock`}
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <StepButton onClick={() => change(v.id, -1, max)} disabled={qty === 0}>
                                −
                              </StepButton>
                              <span className="w-6 text-center tabular-nums text-[14px] font-semibold">{qty}</span>
                              <StepButton onClick={() => change(v.id, 1, max)} disabled={soldOut || (max != null && qty >= max)}>
                                +
                              </StepButton>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mt-4.5 mb-2">2 · Encaissement</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Montant (CFA)</div>
                  <div className="w-full h-[46px] border-[1.5px] border-(--color-primary) rounded-[10px] px-3.5 text-[18px] font-bold tabular-nums flex items-center bg-white">
                    {formatAmount(total)}
                  </div>
                </div>
                <div>
                  <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Date</div>
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
                  checked={delivered}
                  onChange={(e) => setDelivered(e.target.checked)}
                  className="w-4 h-4 accent-(--color-primary)"
                />
                Tenues remises au parent maintenant
              </label>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={notifyWhatsapp}
                  onChange={(e) => setNotifyWhatsapp(e.target.checked)}
                  className="w-4 h-4 accent-(--color-primary)"
                />
                Notifier le parent sur WhatsApp
              </label>

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
                  disabled={pending || chosen.length === 0}
                  className="flex-[1.5] h-[46px] rounded-[10px] bg-(--color-primary) text-white text-[14.5px] font-semibold cursor-pointer disabled:opacity-50"
                >
                  {pending ? "Enregistrement…" : `Valider · ${formatCFA(total)}`}
                </button>
              </div>
            </>
          )}

          {result && result.ok && (
            <div className="py-4">
              <div className="text-[15px] font-semibold text-(--color-success-text)">
                {"queued" in result ? "Vente enregistrée hors ligne" : "Vente enregistrée"}
              </div>
              <div className="text-[13.5px] text-(--color-text-muted) mt-1.5">
                {"queued" in result
                  ? "Elle sera synchronisée et numérotée dès le retour de la connexion."
                  : `Reçu N° ${String(result.receiptNumber).padStart(4, "0")} · ${formatCFA(result.amount)}`}
                {!delivered && " · Tenues à remettre."}
              </div>
              <div className="flex flex-wrap gap-2.5 mt-4">
                {!("queued" in result) && (
                  <a
                    href={`/api/tenues/recus/${result.saleId}/pdf`}
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
    </div>
  );
}

function StepButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-8 h-8 rounded-lg border border-(--color-border-strong) bg-white text-[16px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-default"
    >
      {children}
    </button>
  );
}
