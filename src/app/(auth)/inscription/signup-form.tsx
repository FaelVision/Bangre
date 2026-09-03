"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction } from "@/lib/actions/auth";
import { Field, Label, TextInput, Select, Checkbox } from "@/components/form";
import { Button } from "@/components/ui";
import { GoogleButton, AuthDivider } from "@/components/google-button";

export function SignupForm({
  googleEnabled,
  googleLink,
}: {
  googleEnabled: boolean;
  /** Verified Google identity waiting to be attached to a new establishment. */
  googleLink: { email: string; name: string } | null;
}) {
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

      {googleLink ? (
        <div className="mt-6 rounded-[11px] border border-(--color-success-border) bg-(--color-success-bg-soft) px-4 py-3">
          <div className="text-[13px] font-semibold text-(--color-success-text-dark)">
            Compte Google vérifié · {googleLink.email}
          </div>
          <div className="text-[12.5px] text-(--color-text-secondary) mt-1 leading-relaxed">
            Complétez les informations de l&apos;établissement. Vous vous connecterez ensuite avec Google — pas de mot
            de passe à retenir.
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <GoogleButton label="S'inscrire avec Google" disabled={!googleEnabled} />
          </div>
          <AuthDivider>ou remplissez le formulaire</AuthDivider>
        </>
      )}

      <form action={formAction} className={googleLink ? "mt-6" : ""}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="sm:col-span-2">
            <Field>
              <Label>Nom de l&apos;établissement</Label>
              <TextInput name="schoolName" placeholder="Lycée municipal de Ouagadougou" required />
            </Field>
          </div>
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
          <div className="sm:col-span-2">
            <Field>
              <Label>Responsable du compte</Label>
              <TextInput name="contactName" placeholder="Nom et prénom" defaultValue={googleLink?.name ?? ""} required />
            </Field>
          </div>
          <div className={googleLink ? "sm:col-span-2" : undefined}>
            <Field>
              <Label>Téléphone (WhatsApp)</Label>
              <TextInput name="phone" type="tel" placeholder="+226 __ __ __ __" required />
            </Field>
          </div>
          {!googleLink && (
            <Field>
              <Label>Mot de passe</Label>
              <TextInput name="password" type="password" placeholder="8 caractères minimum" required minLength={8} />
            </Field>
          )}
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
