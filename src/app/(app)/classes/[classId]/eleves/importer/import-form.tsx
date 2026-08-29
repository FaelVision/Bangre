"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importStudentsCsvAction } from "@/lib/actions/students";
import { Button, Card } from "@/components/ui";

export function ImportForm({ classId, className }: { classId: string; className: string }) {
  const boundAction = importStudentsCsvAction.bind(null, classId);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <div className="p-8 max-w-xl">
      <div className="text-[12.5px] text-(--color-text-muted)">
        <Link href={`/classes/${classId}/eleves`} className="text-(--color-primary) font-medium">
          Élèves de la {className}
        </Link>{" "}
        › Import
      </div>
      <div className="text-[19px] font-semibold tracking-tight mt-1 mb-5">Importer des élèves (CSV)</div>

      <Card>
        <div className="text-[13px] text-(--color-text-secondary) leading-relaxed mb-4">
          Fichier CSV avec une ligne d&apos;en-tête, colonnes dans cet ordre :
          <div className="mt-2 bg-(--color-bg-subtle) border border-(--color-border) rounded-lg px-3 py-2 font-mono text-[12.5px]">
            Matricule,Nom,Prenom,DateNaissance,NumeroParent
          </div>
          <div className="mt-2 text-(--color-text-muted)">
            Le matricule et la date de naissance (AAAA-MM-JJ) sont facultatifs.
          </div>
        </div>
        <form action={formAction} className="grid gap-4">
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="text-[13.5px] file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border file:border-(--color-border-strong) file:bg-white file:font-semibold file:cursor-pointer"
          />
          {state?.error && <div className="text-[13px] text-(--color-danger-text)">{state.error}</div>}
          <div className="flex gap-2.5">
            <Link
              href={`/classes/${classId}/eleves`}
              className="flex-1 h-[42px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[13.5px] font-semibold no-underline hover:no-underline"
            >
              Annuler
            </Link>
            <Button type="submit" size="lg" className="flex-1" disabled={pending}>
              {pending ? "Import en cours…" : "Importer"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
