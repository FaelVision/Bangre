"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/lib/actions/auth";
import { Field, Label, TextInput, Checkbox } from "@/components/form";
import { Button } from "@/components/ui";
import { GoogleButton, AuthDivider } from "@/components/google-button";

export function LoginForm({
  googleEnabled,
  googleNotice,
  resetNotice,
}: {
  googleEnabled: boolean;
  googleNotice?: string;
  resetNotice?: string;
}) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <div>
      <div className="text-[27px] font-semibold tracking-tight">Connexion</div>
      <div className="text-sm text-(--color-text-muted) mt-1.5">Accès au bureau du secrétariat.</div>

      {resetNotice && (
        <div className="text-[13px] text-(--color-success-text-dark) bg-(--color-success-bg-soft) border border-(--color-success-border) rounded-lg px-3.5 py-2.5 mt-5">
          {resetNotice}
        </div>
      )}

      {googleNotice && (
        <div className="text-[13px] text-(--color-danger-text) bg-(--color-danger-bg-soft) border border-(--color-danger-border) rounded-lg px-3.5 py-2.5 mt-5">
          {googleNotice}
        </div>
      )}

      <div className="mt-7">
        <GoogleButton disabled={!googleEnabled} />
        {!googleEnabled && (
          <div className="text-[12px] text-(--color-text-muted) mt-2 text-center leading-relaxed">
            La connexion Google n&apos;est pas encore activée sur ce serveur. Renseignez GOOGLE_CLIENT_ID et
            GOOGLE_CLIENT_SECRET dans le fichier .env.
          </div>
        )}
      </div>

      <AuthDivider>ou avec votre numéro</AuthDivider>

      <form action={formAction} className="grid gap-4">
        <Field>
          <Label>Téléphone ou e-mail</Label>
          <TextInput name="identifier" placeholder="+226 70 11 22 33 ou contact@ecole.bf" required />
        </Field>
        <Field>
          <Label>Mot de passe</Label>
          <TextInput name="password" type="password" placeholder="••••••••" required />
        </Field>
        <div className="flex justify-between items-center text-[13px] text-(--color-text-muted)">
          <Checkbox name="remember" label="Rester connecté" defaultChecked />
          <Link href="/mot-de-passe-oublie" className="text-(--color-primary) font-semibold">
            Mot de passe oublié ?
          </Link>
        </div>

        {state?.error && <div className="text-[13px] text-(--color-danger-text)">{state.error}</div>}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Connexion…" : "Se connecter"}
        </Button>

        <div className="text-center text-[13.5px] text-(--color-text-muted)">
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="text-(--color-primary) font-semibold">
            Inscrire mon établissement
          </Link>
        </div>
      </form>

      <div className="mt-7 border-t border-(--color-border) pt-4 flex items-center gap-2.5 text-[12.5px] text-(--color-text-muted)">
        <span className="w-[7px] h-[7px] rounded-full bg-(--color-success-text) shrink-0" />
        Fonctionne hors ligne après la première connexion
      </div>
    </div>
  );
}
