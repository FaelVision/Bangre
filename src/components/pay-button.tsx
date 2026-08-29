"use client";

import { usePaymentModal } from "@/components/payment-modal-context";
import { cn } from "@/lib/cn";

export function PayButton({
  studentId,
  trancheId,
  hint,
  className,
  children,
}: {
  studentId?: string;
  trancheId?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { openPayment } = usePaymentModal();
  return (
    <button type="button" onClick={() => openPayment(studentId, trancheId, hint)} className={cn("cursor-pointer", className)}>
      {children}
    </button>
  );
}
