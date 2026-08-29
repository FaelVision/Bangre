"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createStudentAction } from "@/lib/actions/students";
import { Field, Label, TextInput, Select } from "@/components/form";
import { Button, Card } from "@/components/ui";

export function NewStudentForm({
  classes,
  defaultClassId,
}: {
  classes: { id: string; name: string }[];
  defaultClassId?: string;
}) {
  const [state, formAction, pending] = useActionState(createStudentAction, undefined);

  return (
    <div className="p-8 max-w-2xl">
      <div className="text-[12.5px] text-(--color-text-muted)">
        <Link href="/eleves" className="text-(--color-primary) font-medium">
          Élèves
        </Link>{" "}
        › Nouvel élève
      </div>
      <div className="text-[19px] font-semibold tracking-tight mt-1 mb-5">Ajouter un élève</div>

      <Card>
        <form action={formAction} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3.5">
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
              <TextInput name="birthDate" type="date" />
            </Field>
            <Field>
              <Label>Parent / tuteur</Label>
              <TextInput name="parentName" placeholder="M. Sawadogo Issa" />
            </Field>
            <div className="col-span-2">
              <Field>
                <Label>Numéro du parent (WhatsApp)</Label>
                <TextInput name="parentPhone" type="tel" placeholder="+226 70 11 22 33" />
              </Field>
            </div>
          </div>

          {state?.error && <div className="text-[13px] text-(--color-danger-text)">{state.error}</div>}

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
