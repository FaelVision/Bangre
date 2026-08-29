"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { PaymentModal } from "@/components/payment-modal";

type OpenState = { studentId: string | null; trancheId: string | null; hint?: string } | null;

const Ctx = createContext<{
  openPayment: (studentId?: string, trancheId?: string, hint?: string) => void;
} | null>(null);

export function PaymentModalProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OpenState>(null);

  const openPayment = useCallback((studentId?: string, trancheId?: string, hint?: string) => {
    setState({ studentId: studentId ?? null, trancheId: trancheId ?? null, hint });
  }, []);
  const close = useCallback(() => setState(null), []);

  return (
    <Ctx.Provider value={{ openPayment }}>
      {children}
      {state && (
        <PaymentModal
          key={`${state.studentId ?? "nouveau"}-${state.trancheId ?? ""}`}
          initialStudentId={state.studentId}
          preselectTranche={state.trancheId}
          studentHint={state.hint}
          onClose={close}
        />
      )}
    </Ctx.Provider>
  );
}

export function usePaymentModal() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePaymentModal must be used within PaymentModalProvider");
  return ctx;
}
