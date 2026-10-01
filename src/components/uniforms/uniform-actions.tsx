"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelUniformSale, setUniformDelivered } from "@/lib/uniforms-client";
import { cn } from "@/lib/cn";

type Line = { id: string; label: string; quantity: number; delivered: boolean };

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-[#281C14]/42 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-(--color-bg-app) rounded-[18px] shadow-2xl w-full max-w-md p-5 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[15.5px] font-semibold">{title}</div>
        {children}
      </div>
    </div>
  );
}

/**
 * "Remise": ticks the tenues handed over to the family. A sale still waiting
 * to sync is handed over from its own window, at the counter.
 */
export function UniformDeliverButton({
  lines,
  label,
  disabled,
  className,
}: {
  lines: Line[];
  /** Who it is for, as the outbox shows it. */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const toDeliver = lines.filter((l) => !l.delivered).reduce((n, l) => n + l.quantity, 0);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "Disponible une fois la vente synchronisée" : undefined}
        className={cn(
          "h-8 rounded-lg border border-(--color-border-strong) bg-white px-2.5 text-[12px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default",
          className
        )}
      >
        {toDeliver > 0 ? `Remettre (${toDeliver})` : "Remise"}
      </button>
      {open && <DeliverModal lines={lines} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

function DeliverModal({ lines, label, onClose }: { lines: Line[]; label: string; onClose: () => void }) {
  const router = useRouter();
  // Opens with everything ticked: handing over the whole sale is one click.
  const [checked, setChecked] = useState<Set<string>>(() => new Set(lines.map((l) => l.id)));
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    const give = lines.filter((l) => !l.delivered && checked.has(l.id)).map((l) => l.id);
    const takeBack = lines.filter((l) => l.delivered && !checked.has(l.id)).map((l) => l.id);
    startTransition(async () => {
      let wentToOutbox = false;
      for (const [ids, delivered] of [
        [give, true],
        [takeBack, false],
      ] as const) {
        if (ids.length === 0) continue;
        const res = await setUniformDelivered([...ids], delivered, label);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        if (res.queued) wentToOutbox = true;
      }
      if (wentToOutbox) {
        setQueued(true);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Modal title={`Remise des tenues · ${label}`} onClose={onClose}>
      <p className="text-[12.5px] text-(--color-text-muted) mt-1.5">Cochez ce qui a été remis au parent.</p>
      <div className="grid gap-1 mt-3">
        {lines.map((l) => (
          <label key={l.id} className="flex items-center gap-3 rounded-[10px] px-2.5 py-2 cursor-pointer hover:bg-(--color-bg-subtle)">
            <input
              type="checkbox"
              checked={checked.has(l.id)}
              onChange={() =>
                setChecked((prev) => {
                  const next = new Set(prev);
                  if (next.has(l.id)) next.delete(l.id);
                  else next.add(l.id);
                  return next;
                })
              }
              className="w-4 h-4 accent-(--color-primary)"
            />
            <span className="text-[13.5px] flex-1">
              {l.quantity} × {l.label}
            </span>
            <span className={cn("text-[12px]", l.delivered ? "text-(--color-success-text)" : "text-(--color-gold-text)")}>
              {l.delivered ? "Remise" : "À remettre"}
            </span>
          </label>
        ))}
      </div>
      {queued && (
        <p className="text-[12.5px] text-(--color-gold-text) mt-2">Hors ligne : enregistré sur cet appareil.</p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-(--color-danger-text) mt-2.5">
          {error}
        </p>
      )}
      <div className="flex gap-2.5 mt-4">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 h-[42px] rounded-[10px] border border-(--color-border-strong) bg-white text-[13.5px] font-semibold cursor-pointer"
        >
          Fermer
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="flex-[1.5] h-[42px] rounded-[10px] bg-(--color-primary) text-white text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </Modal>
  );
}

/** Cancels a sale entered by mistake — the day it was made, online. */
export function UniformCancelButton({ saleId, label, className }: { saleId: string; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "h-8 rounded-lg border border-(--color-danger-border) bg-white px-2.5 text-[12px] font-semibold text-(--color-danger-text) cursor-pointer",
          className
        )}
      >
        Annuler
      </button>
      {open && <CancelModal saleId={saleId} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

function CancelModal({ saleId, label, onClose }: { saleId: string; label: string; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await cancelUniformSale(saleId, reason);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Modal title="Annuler cette vente ?" onClose={onClose}>
      <div className="rounded-[10px] border border-(--color-border) bg-white px-3.5 py-2.5 mt-3 text-[13.5px]">{label}</div>
      <p className="text-[12.5px] text-(--color-text-muted) mt-2.5 leading-relaxed">
        Le reçu reste dans le journal, marqué « Annulé » ; son numéro n&apos;est pas réutilisé. Les tenues retournent en
        stock.
      </p>
      <label className="block mt-3">
        <span className="block text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Motif (facultatif)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex. : mauvaise taille, mauvais élève…"
          className="w-full h-[42px] border border-(--color-border-strong) rounded-[10px] px-3 text-[13.5px] bg-white focus:outline-none focus:border-(--color-primary)"
        />
      </label>
      {error && (
        <p role="alert" className="text-[13px] text-(--color-danger-text) mt-2.5">
          {error}
        </p>
      )}
      <div className="flex gap-2.5 mt-4">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 h-[42px] rounded-[10px] border border-(--color-border-strong) bg-white text-[13.5px] font-semibold cursor-pointer"
        >
          Garder
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="flex-[1.5] h-[42px] rounded-[10px] bg-(--color-danger-text) text-white text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
        >
          {pending ? "Annulation…" : "Annuler la vente"}
        </button>
      </div>
    </Modal>
  );
}
