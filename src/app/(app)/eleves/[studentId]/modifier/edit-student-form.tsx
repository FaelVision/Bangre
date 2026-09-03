"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Student } from "@prisma/client";
import { updateStudentAction, deleteStudentAction } from "@/lib/actions/students";
import { Field, Label, TextInput, Select } from "@/components/form";
import { DateInput } from "@/components/date-input";
import { Button, Card } from "@/components/ui";
import { runOrQueue, studentPayloadFrom, type StudentFormState } from "@/lib/offline-forms";
import { OfflineQueuedNotice } from "@/components/offline-queued-notice";

export function EditStudentForm({ student }: { student: Student }) {
  const boundAction = updateStudentAction.bind(null, student.id);

  // Plain onSubmit, not <form action>: `runOrQueue` must decide online/offline
  // on the client before a server action is ever dispatched.
  const [state, setState] = useState<StudentFormState>(undefined);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [deleting, startDelete] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = { ...studentPayloadFrom(formData), classId: student.classId };
    startTransition(async () => {
      setState(
        await runOrQueue(() => boundAction(undefined, formData), {
          payload,
          studentId: student.id,
          label: `Fiche modifiée ${payload.lastName} ${payload.firstName}`.trim(),
        })
      );
    });
  }

  function handleDelete() {
    if (!confirm(`Supprimer définitivement l'élève ${student.lastName} ${student.firstName} ? Cette action est irréversible.`)) return;
    startDelete(async () => {
      const res = await deleteStudentAction(student.id);
      if (res && "error" in res) alert(res.error);
      else router.push(`/classes/${student.classId}/eleves`);
    });
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl">
      <div className="text-[12.5px] text-(--color-text-muted)">
        <Link href={`/eleves/${student.id}`} className="text-(--color-primary) font-medium">
          {student.lastName} {student.firstName}
        </Link>{" "}
        › Modifier
      </div>
      <div className="text-[19px] font-semibold tracking-tight mt-1 mb-5">Modifier la fiche élève</div>

      <Card>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <Field>
                <Label>Matricule</Label>
                <TextInput name="matricule" defaultValue={student.matricule} required />
              </Field>
            </div>
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
              <DateInput name="birthDate" defaultValue={student.birthDate} />
            </Field>
            <Field>
              <Label>Parent / tuteur</Label>
              <TextInput name="parentName" defaultValue={student.parentName ?? ""} />
            </Field>
            <Field>
              <Label>Numéro du parent</Label>
              <TextInput name="parentPhone" type="tel" defaultValue={student.parentPhone ?? ""} />
            </Field>
            <div className="sm:col-span-2">
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
          {state?.queued && <OfflineQueuedNotice label={state.queued} backHref={`/eleves/${student.id}`} />}

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

      <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[12px] border border-(--color-danger-border) bg-white px-4 py-3.5">
        <div className="text-[12.5px] text-(--color-text-muted)">
          Élève ajouté par erreur ? Vous pouvez le supprimer définitivement.
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="h-[38px] shrink-0 rounded-[9px] border border-(--color-danger-border) bg-white px-4 text-[13px] font-semibold text-(--color-danger-text) cursor-pointer disabled:opacity-50"
        >
          {deleting ? "Suppression…" : "Supprimer l'élève"}
        </button>
      </div>
    </div>
  );
}
