"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Scoped to sessionStorage (not localStorage) on purpose: dismissing hides the
// popup for the rest of this browser session, but it comes back at the next
// connection — and immediately if daysLeft itself changes (new day) even
// within the same still-open session.
const DISMISS_KEY = "bangre-subscription-alert-dismissed-days";

export function SubscriptionExpiryAlert({
  daysLeft,
  isTrial,
  untilLabel,
}: {
  daysLeft: number;
  isTrial: boolean;
  untilLabel: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Reads an external system (sessionStorage) to decide whether to show —
    // can only run after mount, so a one-time setState here is unavoidable.
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === String(daysLeft)) return;
    } catch {
      // sessionStorage unavailable (private mode, etc.) — show anyway.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
  }, [daysLeft]);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, String(daysLeft));
    } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  const urgent = daysLeft <= 2;
  const subject = isTrial ? "Votre essai" : "Votre abonnement";

  return (
    <div className="fixed inset-0 bg-[#281C14]/42 flex items-center justify-center p-4 z-[60]">
      <div className="w-full max-w-[420px] bg-white rounded-[18px] shadow-2xl p-5.5">
        <span
          className={`inline-block text-[11.5px] font-semibold px-2.5 py-1 rounded-full ${
            urgent
              ? "bg-(--color-danger-bg) text-(--color-danger-text)"
              : "bg-(--color-gold-chip-bg) text-(--color-gold-text)"
          }`}
        >
          {isTrial ? "Fin d'essai proche" : "Renouvellement proche"}
        </span>
        <div className="text-[18px] font-semibold tracking-tight mt-3">
          {daysLeft === 0
            ? `${subject} se termine aujourd'hui`
            : `${subject} se termine dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`}
        </div>
        <div className="text-[13.5px] text-(--color-text-muted) mt-2 leading-relaxed">
          {isTrial ? "Fin d'essai" : "Renouvellement"} le {untilLabel}. Passé cette date, l&apos;accès à Bangré sera
          bloqué jusqu&apos;au paiement.
        </div>
        <div className="flex gap-2.5 mt-4.5">
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 h-[46px] rounded-[10px] border border-(--color-border-strong) bg-white text-[14.5px] font-semibold cursor-pointer"
          >
            Plus tard
          </button>
          <Link
            href="/abonnement"
            className="flex-[1.5] h-[46px] rounded-[10px] bg-(--color-primary) text-white text-[14.5px] font-semibold cursor-pointer flex items-center justify-center no-underline hover:no-underline"
          >
            Renouveler maintenant
          </Link>
        </div>
      </div>
    </div>
  );
}
