"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { Student } from "@prisma/client";
import { updateStudentAction } from "@/lib/actions/students";
import { Field, Label, TextInput, Select } from "@/components/form";
import { Button, Card } from "@/components/ui";

function isoDate(d: Date | null) {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export function EditStudentForm({ student }: { student: Student }) {
  const boundAction = updateStudentAction.bind(null, student.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <div className="p-8 max-w-2xl">
      <div className="text-[12.5px] text-(--color-text-muted)">
        <Link href={`/eleves/${student.id}`} className="text-(--color-primary) font-medium">
          {student.lastName} {student.firstName}
        </Link>{" "}
        › Modifier
      </div>
      <div className="text-[19px] font-semibold tracking-tight mt-1 mb-5">Modifier la fiche élève</div>

      <Card>
        <form action={formAction} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3.5">
            <Field>
              <Label>Nom</Label>
              <TextInput name="lastName" defaultValue={student.lastName} required />
            </Field>
            <Field>
              <Label>Prénom</Label>
              <TextInput name="firstName" defaultValue={student.firstName} required />
            </Field>
            <Field>
              <Label>Sexe</Label>
              <Select name="gender" defaultValue={student.gender ?? "M"}>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </Select>
            </Field>
            <Field>
              <Label>Date de naissance</Label>
              <TextInput name="birthDate" type="date" defaultValue={isoDate(student.birthDate)} />
            </Field>
            <Field>
              <Label>Parent / tuteur</Label>
              <TextInput name="parentName" defaultValue={student.parentName ?? ""} />
            </Field>
            <Field>
              <Label>Numéro du parent</Label>
              <TextInput name="parentPhone" type="tel" defaultValue={student.parentPhone ?? ""} />
            </Field>
            <div className="col-span-2">
              <Field>
                <Label>Statut WhatsApp</Label>
                <Select name="whatsappStatus" defaultValue={student.whatsappStatus}>
                  <option value="reachable">Joignable</option>
                  <option value="unreachable">Numéro valide, pas de réponse</option>
                  <option value="invalid">Numéro invalide / pas sur WhatsApp</option>
                  <option value="unknown">Inconnu</option>
                </Select>
              </Field>
            </div>
          </div>

          {state?.error && <div className="text-[13px] text-(--color-danger-text)">{state.error}</div>}

          <div className="flex gap-2.5 mt-1.5">
            <Link
              href={`/eleves/${student.id}`}
              className="flex-1 h-[42px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[13.5px] font-semibold no-underline hover:no-underline"
            >
              Annuler
            </Link>
            <Button type="submit" size="lg" className="flex-1" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
