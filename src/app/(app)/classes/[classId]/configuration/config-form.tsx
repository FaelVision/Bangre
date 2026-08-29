"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { SchoolClass, Tranche } from "@prisma/client";
import { saveClassConfigAction } from "@/lib/actions/classes";
import { Field, Label, TextInput, Select, Textarea } from "@/components/form";
import { Button, Card } from "@/components/ui";
import { formatAmount } from "@/lib/format";

const VARIABLES = ["{parent}", "{eleve}", "{classe}", "{montant}", "{echeance}"];

function isoDate(d: Date) {
  return new Date(d).toISOString().slice(0, 10);
}

type TrancheRow = { id: string | null; label: string; amount: string; dueType: string; dueDate: string };

export function ConfigForm({
  clazz,
  yearLabel,
  studentCount,
}: {
  clazz: SchoolClass & { tranches: Tranche[] };
  yearLabel: string;
  studentCount: number;
}) {
  const boundAction = saveClassConfigAction.bind(null, clazz.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  const [tuitionAmount, setTuitionAmount] = useState(String(clazz.tuitionAmount ?? ""));
  const [tranches, setTranches] = useState<TrancheRow[]>(
    clazz.tranches.length
      ? clazz.tranches.map((t) => ({
          id: t.id,
          label: t.label,
          amount: String(t.amount),
          dueType: t.dueType,
          dueDate: isoDate(t.dueDate),
        }))
      : [{ id: null, label: "1re tranche", amount: "", dueType: "date", dueDate: "" }]
  );
  const [reminderEnabled, setReminderEnabled] = useState(clazz.reminderEnabled);

  const trancheSum = tranches.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const total = Number(tuitionAmount) || 0;
  const balanced = tranches.length === 0 || trancheSum === total;

  function updateTranche(i: number, patch: Partial<TrancheRow>) {
    setTranches((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function addTranche() {
    setTranches((prev) => [
      ...prev,
      { id: null, label: `${prev.length + 1}e tranche`, amount: "", dueType: "date", dueDate: "" },
    ]);
  }
  function removeTranche(i: number) {
    setTranches((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form action={formAction}>
      <div className="h-[70px] border-b border-(--color-border) flex items-center gap-3 px-7 sticky top-0 bg-(--color-bg-app) z-10">
        <div>
          <div className="text-[12.5px] text-(--color-text-muted)">
            <Link href="/classes" className="text-(--color-primary) font-medium">
              Classes
            </Link>{" "}
            › {clazz.name}
          </div>
          <div className="text-[19px] font-semibold tracking-tight mt-0.5">Configuration de la {clazz.name}</div>
        </div>
        <div className="flex-1" />
        <Link
          href="/classes"
          className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline"
        >
          Annuler
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>

      {state?.error && (
        <div className="mx-7 mt-4 text-[13px] text-(--color-danger-text) bg-(--color-danger-bg-soft) border border-(--color-danger-border) rounded-lg px-3.5 py-2.5">
          {state.error}
        </div>
      )}

      <div className="p-5.5 px-7 pb-10 grid gap-4" style={{ gridTemplateColumns: "1.35fr 1fr", alignItems: "start" }}>
        <div className="grid gap-4">
          <Card>
            <div className="text-[15px] font-semibold">1 · Montant de la scolarité</div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <Field>
                <Label>Montant total (CFA)</Label>
                <TextInput
                  name="tuitionAmount"
                  type="number"
                  value={tuitionAmount}
                  onChange={(e) => setTuitionAmount(e.target.value)}
                  className="font-semibold text-[16px] border-[1.5px] border-(--color-primary)"
                />
              </Field>
              <Field>
                <Label>Frais d&apos;inscription</Label>
                <TextInput name="registrationFee" type="number" defaultValue={clazz.registrationFee ?? ""} />
              </Field>
              <Field>
                <Label>Année scolaire</Label>
                <TextInput value={yearLabel} disabled className="text-(--color-text-muted)" />
              </Field>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-(--color-text-secondary) mt-3.5">
              <span className="w-[17px] h-[17px] rounded-[5px] bg-(--color-primary) text-white flex items-center justify-center text-[11px]">
                ✓
              </span>
              Ce montant s&apos;applique automatiquement aux {studentCount} élèves de la classe
            </div>
          </Card>

          <Card>
            <div className="flex items-baseline justify-between">
              <div className="text-[15px] font-semibold">2 · Tranches de paiement</div>
              <div className={`text-[12.5px] font-semibold ${balanced ? "text-(--color-success-text)" : "text-(--color-danger-text)"}`}>
                Réparti : {formatAmount(trancheSum)} / {formatAmount(total)} {balanced ? "✓" : ""}
              </div>
            </div>
            <div className="grid gap-2.5 mt-3.5">
              {tranches.map((t, i) => (
                <div key={i} className="grid gap-2.5 border-t border-(--color-border-row) pt-3.5">
                  <div className="flex items-center justify-between">
                    <div className="text-[13px] font-semibold text-(--color-text-secondary)">
                      Tranche {i + 1}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTranche(i)}
                      className="text-[12.5px] text-(--color-danger-text) font-semibold cursor-pointer"
                    >
                      Retirer
                    </button>
                  </div>
                  <div className="grid gap-2.5" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
                    <Field>
                      <Label>Libellé</Label>
                      <TextInput
                        name="tranche_label"
                        value={t.label}
                        onChange={(e) => updateTranche(i, { label: e.target.value })}
                        required
                      />
                    </Field>
                    <Field>
                      <Label>Montant (CFA)</Label>
                      <TextInput
                        name="tranche_amount"
                        type="number"
                        value={t.amount}
                        onChange={(e) => updateTranche(i, { amount: e.target.value })}
                        required
                      />
                    </Field>
                  </div>
                  <div className="grid gap-2.5" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
                    <Field>
                      <Label>Type d&apos;échéance</Label>
                      <Select
                        name="tranche_dueType"
                        value={t.dueType}
                        onChange={(e) => updateTranche(i, { dueType: e.target.value })}
                      >
                        <option value="date">Date précise</option>
                        <option value="end_of_month">Fin de mois</option>
                        <option value="end_of_term">Fin de trimestre</option>
                      </Select>
                    </Field>
                    <Field>
                      <Label>Date</Label>
                      <TextInput
                        name="tranche_dueDate"
                        type="date"
                        value={t.dueDate}
                        onChange={(e) => updateTranche(i, { dueDate: e.target.value })}
                        required
                      />
                    </Field>
                  </div>
                  <input type="hidden" name="tranche_id" value={t.id ?? ""} />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addTranche}
              className="h-[38px] w-full rounded-[9px] border border-dashed border-(--color-border-strong) flex items-center justify-center text-[13.5px] font-semibold text-(--color-primary) mt-3.5 cursor-pointer"
            >
              + Ajouter une tranche
            </button>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-semibold">3 · Rappels WhatsApp</div>
            <button
              type="button"
              onClick={() => setReminderEnabled((v) => !v)}
              className="w-[42px] h-6 rounded-full flex items-center px-0.75 cursor-pointer"
              style={{ background: reminderEnabled ? "var(--color-success-text)" : "#DFD8CC", justifyContent: reminderEnabled ? "flex-end" : "flex-start" }}
            >
              <span className="w-[18px] h-[18px] rounded-full bg-white block" />
            </button>
            <input type="hidden" name="reminderEnabled" value={reminderEnabled ? "on" : ""} />
          </div>
          <div className="text-[13px] text-(--color-text-muted) mt-1.5 leading-relaxed">
            Envoi automatique aux parents, avant et après chaque échéance.
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Field>
              <Label>Avant échéance (jours)</Label>
              <TextInput name="reminderBeforeDays" type="number" defaultValue={clazz.reminderBeforeDays} />
            </Field>
            <Field>
              <Label>Après échéance (jours, virgule)</Label>
              <TextInput name="reminderAfterDays" defaultValue={clazz.reminderAfterDays} />
            </Field>
            <div className="col-span-2">
              <Field>
                <Label>Heure d&apos;envoi</Label>
                <TextInput name="reminderHour" type="time" defaultValue={clazz.reminderHour} />
              </Field>
            </div>
          </div>
          <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mt-4.5 mb-2">
            Message envoyé au parent
          </div>
          <Textarea
            name="reminderMessageTemplate"
            defaultValue={clazz.reminderMessageTemplate ?? ""}
            rows={5}
            className="bg-(--color-success-bg) border-none text-[13.5px] leading-relaxed text-[#20301F]"
          />
          <div className="flex flex-wrap gap-1.5 mt-3">
            {VARIABLES.map((v) => (
              <span
                key={v}
                className="text-xs px-2.5 py-1 rounded-full border border-(--color-border-strong) bg-(--color-bg-subtle)"
              >
                {v}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </form>
  );
}
