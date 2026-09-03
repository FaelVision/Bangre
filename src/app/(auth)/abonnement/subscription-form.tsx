"use client";

import { useActionState, useState } from "react";
import { paySubscriptionAction } from "@/lib/actions/subscription";
import { Field, Label, TextInput } from "@/components/form";
import { Button } from "@/components/ui";
import { formatAmount } from "@/lib/format";
import { PLAN_LIST, PLANS, yearlySavings, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/cn";

const PROVIDERS = [
  { id: "orange_money", label: "Orange Money", color: "#F58220" },
  { id: "moov_money", label: "Moov Money", color: "#0B5FA5" },
] as const;

export function SubscriptionForm({ defaultPhone }: { defaultPhone: string }) {
  const [state, formAction, pending] = useActionState(paySubscriptionAction, undefined);
  const [provider, setProvider] = useState<string>("orange_money");
  const [plan, setPlan] = useState<PlanId>("yearly");

  const savings = yearlySavings();
  const selectedPlan = PLANS[plan];

  return (
    <form action={formAction}>
      <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mt-5.5 mb-2.5">
        Choisir une formule
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {PLAN_LIST.map((p) => {
          const active = plan === p.id;
          return (
            <label
              key={p.id}
              className={cn(
                "relative rounded-[11px] bg-white p-3.5 cursor-pointer block",
                active ? "border-[1.5px] border-(--color-primary)" : "border border-(--color-border-strong)"
              )}
            >
              <input
                type="radio"
                name="plan"
                value={p.id}
                checked={active}
                onChange={() => setPlan(p.id)}
                className="sr-only"
              />
              <div className="flex items-center gap-2">
                <span
                  className="w-[9px] h-[9px] rounded-full shrink-0"
                  style={{
                    background: active ? "var(--color-primary)" : "transparent",
                    border: active ? "none" : "1.5px solid #C9C1B5",
                    boxShadow: active ? "0 0 0 4px var(--color-success-bg)" : "none",
                  }}
                />
                <span className="text-[14px] font-semibold">{p.label}</span>
                {p.id === "yearly" && (
                  <span className="ml-auto text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-(--color-gold-chip-bg) text-(--color-gold-text) whitespace-nowrap">
                    {savings.freeMonths} mois offert{savings.freeMonths > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="text-[21px] font-bold tracking-tight tabular-nums mt-2">{formatAmount(p.amount)}</div>
              <div className="text-[12px] text-(--color-text-muted)">CFA {p.period}</div>
            </label>
          );
        })}
      </div>

      {plan === "yearly" && (
        <div className="text-[12.5px] text-(--color-success-text) bg-(--color-success-bg-soft) border border-(--color-success-border) rounded-lg px-3 py-2 mt-2.5">
          Vous économisez {formatAmount(savings.saved)} CFA par rapport à {formatAmount(savings.twelveMonths)} CFA en
          12 paiements mensuels.
        </div>
      )}

      <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mt-5 mb-2.5">
        Payer avec Mobile Money
      </div>
      <div className="grid gap-2.5">
        {PROVIDERS.map((p) => (
          <label
            key={p.id}
            className={cn(
              "h-[52px] rounded-[11px] bg-white flex items-center gap-3 px-3.5 cursor-pointer",
              provider === p.id ? "border-[1.5px] border-(--color-primary)" : "border border-(--color-border-strong)"
            )}
          >
            <input
              type="radio"
              name="provider"
              value={p.id}
              checked={provider === p.id}
              onChange={() => setProvider(p.id)}
              className="sr-only"
            />
            <span
              className="w-[9px] h-[9px] rounded-full shrink-0"
              style={{
                background: provider === p.id ? "var(--color-primary)" : "transparent",
                border: provider === p.id ? "none" : "1.5px solid #C9C1B5",
                boxShadow: provider === p.id ? "0 0 0 4px var(--color-success-bg)" : "none",
              }}
            />
            <span className="w-[34px] h-6 rounded-[5px] shrink-0" style={{ background: p.color }} />
            <span className="text-[14.5px] font-medium">{p.label}</span>
          </label>
        ))}
      </div>

      <Field>
        <div className="mt-4">
          <Label>Numéro à débiter</Label>
          <TextInput name="phone" type="tel" defaultValue={defaultPhone} required />
        </div>
      </Field>

      {state?.error && <div className="text-[13px] text-(--color-danger-text) mt-3">{state.error}</div>}

      <Button type="submit" size="lg" className="w-full mt-5" disabled={pending}>
        {pending ? "Paiement en cours…" : `Payer ${formatAmount(selectedPlan.amount)} CFA`}
      </Button>
      <div className="text-[12.5px] text-(--color-text-muted) text-center mt-3">
        Vous recevrez un code USSD sur ce numéro pour valider.
      </div>
    </form>
  );
}
