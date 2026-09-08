"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createClassAction } from "@/lib/actions/classes";
import { Field, Label, TextInput, Select } from "@/components/form";
import { Button, Card } from "@/components/ui";

export default function NewClassPage() {
  const [state, formAction, pending] = useActionState(createClassAction, undefined);

  return (
    <div className="p-4 lg:p-8 max-w-lg">
      <div className="text-[12.5px] text-(--color-text-muted)">
        <Link href="/classes" className="text-(--color-primary) font-medium">
          Classes
        </Link>{" "}
        › Nouvelle classe
      </div>
      <div className="text-[19px] font-semibold tracking-tight mt-1 mb-5">Ajouter une classe</div>

      <Card>
        <form action={formAction} className="grid gap-4">
          <Field>
            <Label>Nom de la classe</Label>
            <TextInput name="name" placeholder="Ex. 6e C, Terminale D" required />
          </Field>
          <Field>
            <Label>Niveau</Label>
            <Select name="level" defaultValue="Collège">
              <option value="Primaire">Primaire</option>
              <option value="Collège">Collège</option>
              <option value="Lycée">Lycée</option>
            </Select>
          </Field>
          {state?.error && <div className="text-[13px] text-(--color-danger-text)">{state.error}</div>}
          <div className="flex gap-2.5 mt-1.5">
            <Link
              href="/classes"
              className="flex-1 h-[42px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[13.5px] font-semibold no-underline hover:no-underline"
            >
              Annuler
            </Link>
            <Button type="submit" size="lg" className="flex-1" disabled={pending}>
              {pending ? "Création…" : "Continuer"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
