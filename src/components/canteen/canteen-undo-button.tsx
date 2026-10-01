"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { undoCanteenAction } from "@/lib/canteen-client";
import { cn } from "@/lib/cn";

/**
 * "Annuler" on a line of the canteen history (or a payment of the journal):
 * puts the student's canteen back as before that action. The day it was made
 * only. A cancelled payment stays in the journal, marked "Annulé".
 */
export function CanteenUndoButton({
  actionId,
  label,
  isPayment = false,
  className,
}: {
  actionId: string;
  /** What is being undone, as the history words it. */
  label: string;
  isPayment?: boolean;
  className?: string;
}) {
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
      {open && <UndoModal actionId={actionId} label={label} isPayment={isPayment} onClose={() => setOpen(false)} />}
    </>
  );
}

function UndoModal({
  actionId,
  label,
  isPayment,
  onClose,
}: {
  actionId: string;
  label: string;
  isPayment: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await undoCanteenAction(actionId, reason);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 bg-[#281C14]/42 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-(--color-bg-app) rounded-[18px] shadow-2xl w-full max-w-md p-5 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[15.5px] font-semibold">{isPayment ? "Annuler ce paiement ?" : "Annuler cette action ?"}</div>
        <div className="rounded-[10px] border border-(--color-border) bg-white px-3.5 py-2.5 mt-3 text-[13.5px]">{label}</div>
        <p className="text-[12.5px] text-(--color-text-muted) mt-2.5 leading-relaxed">
          {isPayment
            ? "Le reçu reste dans le journal, marqué « Annulé » ; son numéro n'est pas réutilisé. Les mois qu'il couvrait redeviennent dus."
            : "La cantine de l'élève redevient exactement comme avant cette action."}
        </p>
        <label className="block mt-3">
          <span className="block text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">
            Motif (facultatif)
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isPayment ? "Ex. : mauvais élève, mauvais mois…" : "Ex. : erreur de saisie"}
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
            {pending ? "Annulation…" : isPayment ? "Annuler le paiement" : "Annuler l'action"}
          </button>
        </div>
      </div>
    </div>
  );
}
