"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/lib/actions/auth";
import { Field, Label, TextInput, Checkbox } from "@/components/form";
import { Button } from "@/components/ui";

export default function ConnexionPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <div>
      <div className="text-[27px] font-semibold tracking-tight">Connexion</div>
      <div className="text-sm text-(--color-text-muted) mt-1.5">Accès au bureau du secrétariat.</div>

      <form action={formAction} className="grid gap-4 mt-8">
        <Field>
          <Label>Téléphone</Label>
          <TextInput name="phone" type="tel" placeholder="+226 70 11 22 33" defaultValue="+226 70 11 22 33" required />
        </Field>
        <Field>
          <Label>Mot de passe</Label>
          <TextInput name="password" type="password" placeholder="••••••••" defaultValue="password123" required />
        </Field>
        <div className="flex justify-between items-center text-[13px] text-(--color-text-muted)">
          <Checkbox name="remember" label="Rester connecté" defaultChecked />
          <a href="#">Mot de passe oublié ?</a>
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
        <span className="w-[7px] h-[7px] rounded-full bg-(--color-success-text)" />
        Fonctionne hors ligne après la première connexion
      </div>
    </div>
  );
}
