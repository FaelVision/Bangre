"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction } from "@/lib/actions/auth";
import { Field, Label, TextInput, Select, Checkbox } from "@/components/form";
import { Button } from "@/components/ui";

export default function InscriptionPage() {
  const [state, formAction, pending] = useActionState(signupAction, undefined);

  return (
    <div>
      <div className="text-[13px] font-semibold text-(--color-primary) tracking-wider uppercase">
        Étape 1 sur 2
      </div>
      <div className="text-[27px] font-semibold tracking-tight mt-2">Inscrire l&apos;établissement</div>
      <div className="text-sm text-(--color-text-muted) mt-1.5">
        Un seul compte par établissement, utilisé par le secrétariat.
      </div>

      <form action={formAction} className="mt-7">
        <div className="grid grid-cols-2 gap-3.5">
          <Field>
            <div className="col-span-2">
              <Label>Nom de l&apos;établissement</Label>
              <TextInput name="schoolName" placeholder="Lycée municipal de Ouagadougou" required />
            </div>
          </Field>
          <Field>
            <Label>Ville</Label>
            <TextInput name="city" placeholder="Ouagadougou" required />
          </Field>
          <Field>
            <Label>Type</Label>
            <Select name="type" defaultValue="Secondaire">
              <option value="Primaire">Primaire</option>
              <option value="Secondaire">Secondaire</option>
              <option value="Franco-arabe">Franco-arabe</option>
            </Select>
          </Field>
          <Field>
            <div className="col-span-2">
              <Label>Responsable du compte</Label>
              <TextInput name="contactName" placeholder="Nom et prénom" required />
            </div>
          </Field>
          <Field>
            <Label>Téléphone (WhatsApp)</Label>
            <TextInput name="phone" type="tel" placeholder="+226 __ __ __ __" required />
          </Field>
          <Field>
            <Label>Mot de passe</Label>
            <TextInput name="password" type="password" placeholder="8 caractères minimum" required minLength={8} />
          </Field>
        </div>

        <div className="mt-4.5">
          <Checkbox name="terms" required label="J'accepte les conditions d'utilisation de Bangre." />
        </div>

        {state?.error && <div className="text-[13px] text-(--color-danger-text) mt-3">{state.error}</div>}

        <Button type="submit" size="lg" className="w-full mt-5.5" disabled={pending}>
          {pending ? "Création…" : "Continuer vers l'abonnement"}
        </Button>

        <div className="text-center text-[13.5px] text-(--color-text-muted) mt-3.5">
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="text-(--color-primary) font-semibold">
            Se connecter
          </Link>
        </div>
      </form>
    </div>
  );
}
