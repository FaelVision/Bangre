"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmSubscriptionPaymentAction, rejectSubscriptionPaymentAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Confirm/reject a pending subscription payment — shown on the admin schools list and school detail page. */
export function PaymentDecisionButtons({ paymentId, size = "sm" }: { paymentId: string; size?: "sm" | "md" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(action: typeof confirmSubscriptionPaymentAction) {
    setError(null);
    startTransition(async () => {
      const res = await action(paymentId);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size={size}
          disabled={pending}
          onClick={() => decide(rejectSubscriptionPaymentAction)}
          className="text-(--color-danger-text) border-(--color-danger-border)"
        >
          Rejeter
        </Button>
        <Button
          type="button"
          variant="primary"
          size={size}
          disabled={pending}
          onClick={() => decide(confirmSubscriptionPaymentAction)}
        >
          Confirmer
        </Button>
      </div>
      {error && <div className={cn("text-[11.5px] text-(--color-danger-text)")}>{error}</div>}
    </div>
  );
}
