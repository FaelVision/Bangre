"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createStudentAction } from "@/lib/actions/students";
import { Field, Label, TextInput, Select } from "@/components/form";
import { DateInput } from "@/components/date-input";
import { Button, Card } from "@/components/ui";
import { runOrQueue, studentPayloadFrom, type StudentFormState } from "@/lib/offline-forms";
import { OfflineQueuedNotice } from "@/components/offline-queued-notice";

export function NewStudentForm({
  classes,
  defaultClassId,
  suggestedMatricule,
}: {
  classes: { id: string; name: string }[];
  defaultClassId?: string;
  suggestedMatricule: string;
}) {
  // A plain onSubmit handler (not a <form action>): the offline check in
  // `runOrQueue` must run on the client before any server action is dispatched,
  // otherwise a submit made offline fetches, fails, and trips the error boundary.
  const [state, setState] = useState<StudentFormState>(undefined);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = studentPayloadFrom(formData);
    startTransition(async () => {
      setState(
        await runOrQueue(() => createStudentAction(undefined, formData), {
          payload,
          label: `Nouvel élève ${payload.lastName} ${payload.firstName}`.trim(),
        })
      );
    });
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl">
      <div className="text-[12.5px] text-(--color-text-muted)">
        <Link href="/eleves" className="text-(--color-primary) font-medium">
          Élèves
        </Link>{" "}
        › Nouvel élève
      </div>
      <div className="text-[19px] font-semibold tracking-tight mt-1 mb-5">Ajouter un élève</div>

      <Card>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field>
              <Label>Classe</Label>
              <Select name="classId" defaultValue={defaultClassId} required>
                <option value="" disabled>
                  Sélectionner…
                </option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label>Sexe</Label>
              <Select name="gender" defaultValue="M">
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field>
                <Label>Matricule</Label>
                <TextInput name="matricule" defaultValue={suggestedMatricule} placeholder={suggestedMatricule} required />
                <span className="mt-1 block text-[11.5px] text-(--color-text-muted)">
                  Proposé automatiquement — modifiable librement.
                </span>
              </Field>
            </div>
            <Field>
              <Label>Nom</Label>
              <TextInput name="lastName" placeholder="SAWADOGO" required />
            </Field>
            <Field>
              <Label>Prénom</Label>
              <TextInput name="firstName" placeholder="Aminata" required />
            </Field>
            <Field>
              <Label>Date de naissance</Label>
              <DateInput name="birthDate" />
            </Field>
            <Field>
              <Label>Parent / tuteur</Label>
              <TextInput name="parentName" placeholder="M. Sawadogo Issa" />
            </Field>
            <div className="sm:col-span-2">
              <Field>
                <Label>Numéro du parent (WhatsApp)</Label>
                <TextInput name="parentPhone" type="tel" placeholder="+226 70 11 22 33" />
              </Field>
            </div>
          </div>

          {state?.error && <div className="text-[13px] text-(--color-danger-text)">{state.error}</div>}
          {state?.queued && <OfflineQueuedNotice label={state.queued} backHref="/eleves" />}

          <div className="flex gap-2.5 mt-1.5">
            <Link
              href="/eleves"
              className="flex-1 h-[42px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[13.5px] font-semibold no-underline hover:no-underline"
            >
              Annuler
            </Link>
            <Button type="submit" size="lg" className="flex-1" disabled={pending}>
              {pending ? "Enregistrement…" : "Ajouter l'élève"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
