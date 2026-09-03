"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatAmount, formatCFA, formatDate } from "@/lib/format";
import { getPaymentContextAction, recordPaymentAction, searchStudentsAction } from "@/lib/actions/payments";
import { enqueuePayment, savePaymentContext, loadPaymentContext } from "@/lib/offline-queue";
import { DateInput } from "@/components/date-input";

type TrancheOption = {
  id: string;
  label: string;
  kind: string;
  amount: number;
  remaining: number;
  dueDate: string;
  status: "paid" | "partial" | "late" | "pending";
  daysLate: number;
};

type Context = {
  student: { id: string; firstName: string; lastName: string; matricule: string; className: string };
  schoolName: string;
  receivedByDefault: string;
  nextReceiptNumber: number;
  tranches: TrancheOption[];
};

export function PaymentModal({
  initialStudentId,
  preselectTranche,
  studentHint,
  onClose,
}: {
  initialStudentId: string | null;
  preselectTranche: string | null;
  studentHint?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState<string | null>(initialStudentId);
  const [context, setContext] = useState<Context | null | "error">(null);
  const [contextIsCached, setContextIsCached] = useState(false);
  const [offlineFallback, setOfflineFallback] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ paymentId: string; receiptNumber: number; amount: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{ id: string; label: string }[]>([]);

  const [selectedTranches, setSelectedTranches] = useState<Set<string>>(new Set(preselectTranche ? [preselectTranche] : []));
  const [mode, setMode] = useState<"tranches" | "partial">("tranches");
  const [partialAmount, setPartialAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("cash");
  const [receivedBy, setReceivedBy] = useState("");
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(true);

  const applyContext = useCallback(
    (ctx: Context, fromCache: boolean) => {
      setContext(ctx);
      setContextIsCached(fromCache);
      setReceivedBy(ctx.receivedByDefault);
      if (preselectTranche && ctx.tranches.some((t) => t.id === preselectTranche)) {
        setSelectedTranches(new Set([preselectTranche]));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /** Offline (or once the network turns out to be unreachable): reuse the last
   *  tranche state we cached for this student so the full picker still works. */
  const resolveOfflineContext = useCallback(
    async (id: string) => {
      const cached = await loadPaymentContext(id);
      if (cached && cached.context) {
        applyContext(cached.context as Context, true);
      } else {
        setOfflineFallback(true);
        setMode("partial");
      }
    },
    [applyContext]
  );

  const loadContext = useCallback((id: string) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      void resolveOfflineContext(id);
      return;
    }
    startTransition(async () => {
      try {
        const ctx = await getPaymentContextAction(id);
        if ("error" in ctx) {
          setErrorMsg(ctx.error ?? "Erreur inconnue.");
          setContext("error");
        } else {
          applyContext(ctx, false);
          void savePaymentContext(id, ctx);
        }
      } catch {
        // No network reachable at all (not just a slow/offline flag) — reuse the
        // cached tranche state if we have it, else the reduced offline form.
        void resolveOfflineContext(id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Fetching-on-mount pattern (React docs: "Fetching data"), triggered
    // whenever the selected student changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (studentId) loadContext(studentId);
  }, [studentId, loadContext]);

  useEffect(() => {
    if (mode !== "tranches" || !context || context === "error") return;
    // no-op, amount derived in render
  }, [mode, context]);

  useEffect(() => {
    if (studentId) return;
    const t = setTimeout(async () => {
      if (query.trim().length === 0) {
        setMatches([]);
        return;
      }
      const res = await searchStudentsAction(query);
      setMatches(res);
    }, 250);
    return () => clearTimeout(t);
  }, [query, studentId]);

  const trancheAmount =
    context && context !== "error"
      ? context.tranches.filter((t) => selectedTranches.has(t.id)).reduce((s, t) => s + t.remaining, 0)
      : 0;
  const amount = mode === "tranches" ? trancheAmount : Number(partialAmount) || 0;

  function toggleTranche(id: string) {
    setSelectedTranches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!studentId) return;
    const payload = {
      studentId,
      mode,
      trancheIds: mode === "tranches" ? Array.from(selectedTranches) : [],
      amount,
      date,
      method,
      receivedBy,
      notifyWhatsapp,
    };

    const label = `Paiement ${formatAmount(amount)} CFA · ${
      context && context !== "error"
        ? `${context.student.lastName} ${context.student.firstName}`
        : (studentHint ?? "élève")
    }`;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueuePayment(payload, label);
      setResult({ paymentId: "offline", receiptNumber: 0, amount });
      return;
    }

    startTransition(async () => {
      try {
        const res = await recordPaymentAction(payload);
        if (res.ok) {
          setResult(res);
          router.refresh();
        } else {
          setErrorMsg(res.error);
        }
      } catch {
        await enqueuePayment(payload, label);
        setResult({ paymentId: "offline", receiptNumber: 0, amount });
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-[#281C14]/42 flex items-stretch sm:items-start justify-center p-0 sm:p-6 lg:p-8 z-50 overflow-auto overscroll-contain">
      <div className="flex flex-col lg:flex-row flex-wrap gap-0 sm:gap-4 items-stretch lg:items-start w-full sm:max-w-[1000px]">
        <div className="lg:flex-[1.3] lg:min-w-[420px] w-full min-h-[100dvh] sm:min-h-0 bg-(--color-bg-app) rounded-none sm:rounded-[18px] shadow-2xl overflow-hidden">
          <div className="px-4 sm:px-5.5 py-4 sm:py-4.5 border-b border-(--color-border) flex items-center sticky top-0 bg-(--color-bg-app) z-10">
            <div>
              <div className="text-[18px] font-semibold tracking-tight">Enregistrer un paiement</div>
              {context && context !== "error" && (
                <div className="text-[13px] text-(--color-text-muted) mt-0.5">
                  {context.student.lastName} {context.student.firstName} · {context.student.className} ·{" "}
                  {context.student.matricule}
                </div>
              )}
            </div>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-[9px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[15px] text-(--color-text-mutedalt) cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="p-4 sm:p-5.5">
            {!studentId && (
              <div>
                <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-2">
                  Rechercher un élève
                </div>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nom, prénom ou matricule…"
                  className="w-full h-11 rounded-[10px] border border-(--color-border-strong) px-3.5 text-[14.5px] focus:outline-none focus:border-(--color-primary)"
                />
                <div className="grid gap-1.5 mt-3">
                  {matches.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setStudentId(m.id)}
                      className="text-left h-11 rounded-[10px] border border-(--color-border-strong) bg-white px-3.5 text-[13.5px] cursor-pointer hover:bg-(--color-bg-subtle)"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {studentId && !offlineFallback && context === null && (
              <div className="text-[13.5px] text-(--color-text-muted) py-6">Chargement…</div>
            )}
            {studentId && !offlineFallback && context === "error" && (
              <div className="text-[13.5px] text-(--color-danger-text) py-4">{errorMsg}</div>
            )}

            {studentId && offlineFallback && !result && (
              <div>
                <div className="rounded-lg border border-(--color-gold-border) bg-(--color-gold-bg) text-(--color-gold-text) text-[12.5px] px-3.5 py-2.5 mb-4 leading-relaxed">
                  Hors ligne : le détail des tranches n&apos;est pas disponible. Saisissez un montant libre — il sera
                  réparti sur les tranches dues dès la synchronisation.
                </div>
                {studentHint && <div className="text-[13.5px] font-semibold mb-3.5">{studentHint}</div>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Montant reçu (CFA)</div>
                    <input
                      type="number"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      className="w-full h-[46px] border-[1.5px] border-(--color-primary) rounded-[10px] px-3.5 text-[18px] font-bold tabular-nums focus:outline-none"
                    />
                  </div>
                  <div>
                    <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Date du paiement</div>
                    <DateInput value={date} onValueChange={setDate} />
                  </div>
                  <div>
                    <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Mode</div>
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      className="w-full h-[46px] border border-(--color-border-strong) rounded-[10px] px-3.5 text-[14.5px] focus:outline-none focus:border-(--color-primary)"
                    >
                      <option value="cash">Espèces</option>
                      <option value="mobile_money">Mobile Money</option>
                      <option value="bank">Virement bancaire</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Reçu par</div>
                    <input
                      value={receivedBy}
                      onChange={(e) => setReceivedBy(e.target.value)}
                      placeholder="Votre nom"
                      className="w-full h-[46px] border border-(--color-border-strong) rounded-[10px] px-3.5 text-[14.5px] focus:outline-none focus:border-(--color-primary)"
                    />
                  </div>
                </div>
                <div className="flex gap-2.5 mt-4.5">
                  <button
                    onClick={onClose}
                    className="flex-1 h-[46px] rounded-[10px] border border-(--color-border-strong) bg-white text-[14.5px] font-semibold cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={submit}
                    disabled={amount <= 0}
                    className="flex-[1.5] h-[46px] rounded-[10px] bg-(--color-primary) text-white text-[14.5px] font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Enregistrer hors ligne
                  </button>
                </div>
              </div>
            )}

            {studentId && !offlineFallback && context && context !== "error" && !result && (
              <>
                {contextIsCached && (
                  <div className="rounded-lg border border-(--color-gold-border) bg-(--color-gold-bg) text-(--color-gold-text) text-[12.5px] px-3.5 py-2.5 mb-4 leading-relaxed">
                    Hors ligne : tranches affichées d&apos;après la dernière consultation de cet élève. Le paiement est
                    mis en file et le serveur recalcule la répartition exacte à la synchronisation.
                  </div>
                )}
                <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-2">
                  1 · Tranche(s) payée(s)
                </div>
                <div className="grid gap-2">
                  {context.tranches.map((t) => {
                    const active = mode === "tranches" && selectedTranches.has(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setMode("tranches");
                          toggleTranche(t.id);
                        }}
                        className={`flex items-center gap-3 rounded-[11px] px-3.5 py-3 text-left cursor-pointer bg-white ${
                          active ? "border-[1.5px] border-(--color-primary)" : "border border-(--color-border-strong)"
                        }`}
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
                        <div className="flex-1">
                          <div className="text-[14.5px] font-semibold flex items-center gap-1.5">
                            {t.label}
                            {t.kind === "registration" && (
                              <span className="text-[10.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-(--color-gold-chip-bg) text-(--color-gold-text)">
                                Inscription
                              </span>
                            )}
                          </div>
                          <div className={`text-[12.5px] ${t.status === "late" ? "text-(--color-danger-text)" : "text-(--color-text-muted)"}`}>
                            Échéance {formatDate(t.dueDate)}
                            {t.status === "late" ? " · en retard" : ""}
                            {t.remaining !== t.amount ? ` · reste ${formatAmount(t.remaining)}` : ""}
                          </div>
                        </div>
                        <b className="text-[15px] tabular-nums whitespace-nowrap">{formatAmount(t.remaining)}</b>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setMode("partial")}
                    className={`flex items-center gap-3 rounded-[11px] px-3.5 py-3 text-left cursor-pointer bg-white ${
                      mode === "partial" ? "border-[1.5px] border-(--color-primary)" : "border border-(--color-border-strong)"
                    }`}
                  >
                    <span
                      className="w-[19px] h-[19px] rounded-[6px] flex items-center justify-center text-[12px] shrink-0"
                      style={{
                        background: mode === "partial" ? "var(--color-primary)" : "#fff",
                        color: mode === "partial" ? "#fff" : "transparent",
                        border: mode === "partial" ? "none" : "1.5px solid #C9C1B5",
                      }}
                    >
                      ✓
                    </span>
                    <div className="flex-1">
                      <div className="text-[14.5px] font-semibold">Paiement partiel</div>
                      <div className="text-[12.5px] text-(--color-text-muted)">Montant libre à saisir</div>
                    </div>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4.5">
                  <div>
                    <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Montant reçu (CFA)</div>
                    {mode === "partial" ? (
                      <input
                        type="number"
                        value={partialAmount}
                        onChange={(e) => setPartialAmount(e.target.value)}
                        className="w-full h-[46px] border-[1.5px] border-(--color-primary) rounded-[10px] px-3.5 text-[18px] font-bold tabular-nums focus:outline-none"
                      />
                    ) : (
                      <div className="w-full h-[46px] border-[1.5px] border-(--color-primary) rounded-[10px] px-3.5 text-[18px] font-bold tabular-nums flex items-center bg-white">
                        {formatAmount(amount)}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Date du paiement</div>
                    <DateInput value={date} onValueChange={setDate} />
                  </div>
                  <div>
                    <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Mode</div>
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      className="w-full h-[46px] border border-(--color-border-strong) rounded-[10px] px-3.5 text-[14.5px] focus:outline-none focus:border-(--color-primary)"
                    >
                      <option value="cash">Espèces</option>
                      <option value="mobile_money">Mobile Money</option>
                      <option value="bank">Virement bancaire</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Reçu par</div>
                    <input
                      value={receivedBy}
                      onChange={(e) => setReceivedBy(e.target.value)}
                      className="w-full h-[46px] border border-(--color-border-strong) rounded-[10px] px-3.5 text-[14.5px] focus:outline-none focus:border-(--color-primary)"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border border-(--color-border) bg-(--color-bg-subtle) rounded-xl px-4 py-3.5 mt-4">
                  <div>
                    <div className="text-[12.5px] text-(--color-text-muted)">Nouveau reste à payer</div>
                    <div className="text-[19px] font-bold tabular-nums">
                      {formatCFA(Math.max(0, context.tranches.reduce((s, t) => s + t.remaining, 0) - amount))}
                    </div>
                  </div>
                  <div className="hidden sm:block flex-1" />
                  <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyWhatsapp}
                      onChange={(e) => setNotifyWhatsapp(e.target.checked)}
                      className="w-4 h-4 accent-(--color-primary)"
                    />
                    Notifier le parent sur WhatsApp
                  </label>
                </div>

                {errorMsg && <div className="text-[13px] text-(--color-danger-text) mt-3">{errorMsg}</div>}

                <div className="flex gap-2.5 mt-4.5">
                  <button
                    onClick={onClose}
                    className="flex-1 h-[46px] rounded-[10px] border border-(--color-border-strong) bg-white text-[14.5px] font-semibold cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={submit}
                    disabled={pending || amount <= 0}
                    className="flex-[1.5] h-[46px] rounded-[10px] bg-(--color-primary) text-white text-[14.5px] font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {pending ? "Enregistrement…" : "Valider et générer le reçu"}
                  </button>
                </div>
                <div className="text-[12.5px] text-(--color-text-muted) text-center mt-3">
                  Hors ligne : le reçu est numéroté localement, puis synchronisé.
                </div>
              </>
            )}

            {result && (
              <div className="py-4">
                <div className="text-[15px] font-semibold text-(--color-success-text)">
                  {result.paymentId === "offline" ? "Paiement enregistré hors ligne" : "Paiement enregistré"}
                </div>
                <div className="text-[13.5px] text-(--color-text-muted) mt-1.5">
                  {result.paymentId === "offline"
                    ? "Il sera synchronisé et numéroté dès le retour de la connexion."
                    : `Reçu N° ${String(result.receiptNumber).padStart(4, "0")} · ${formatCFA(result.amount)}`}
                </div>
                <div className="flex gap-2.5 mt-4">
                  {result.paymentId !== "offline" && (
                    <a
                      href={`/api/receipts/${result.paymentId}/pdf`}
                      target="_blank"
                      className="flex-1 h-[42px] rounded-[10px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[13.5px] font-semibold no-underline hover:no-underline"
                    >
                      Ouvrir le reçu PDF
                    </a>
                  )}
                  <button
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

        {context && context !== "error" && (
          <div className="w-full lg:w-[300px] lg:flex-1 bg-white rounded-none sm:rounded-[18px] shadow-2xl p-4 sm:p-5.5">
            <div className="text-center border-b border-dashed border-(--color-border-strong) pb-3.5">
              <div className="text-xs tracking-wider uppercase text-(--color-text-muted)">Reçu de paiement</div>
              <div className="text-[15px] font-semibold mt-1.5">{context.schoolName}</div>
              <div className="text-[12.5px] text-(--color-text-muted) mt-0.5 tabular-nums">
                N° {String(result?.receiptNumber || context.nextReceiptNumber).padStart(4, "0")} · {formatDate(date)}
              </div>
            </div>
            <div className="grid gap-2 mt-3.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-(--color-text-muted)">Élève</span>
                <b>
                  {context.student.lastName} {context.student.firstName}
                </b>
              </div>
              <div className="flex justify-between">
                <span className="text-(--color-text-muted)">Classe</span>
                <b>{context.student.className}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-(--color-text-muted)">Objet</span>
                <b>{mode === "tranches" ? context.tranches.filter((t) => selectedTranches.has(t.id)).map((t) => t.label).join(", ") || "—" : "Paiement partiel"}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-(--color-text-muted)">Mode</span>
                <b>{method === "cash" ? "Espèces" : method === "mobile_money" ? "Mobile Money" : "Virement"}</b>
              </div>
            </div>
            <div className="border-t border-dashed border-(--color-border-strong) mt-3.5 pt-3.5 grid gap-2">
              <div className="flex justify-between items-baseline">
                <span className="text-[13px] text-(--color-text-muted)">Montant</span>
                <b className="text-[20px] tabular-nums">{formatCFA(amount)}</b>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
