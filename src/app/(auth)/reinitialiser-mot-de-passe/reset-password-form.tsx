"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/lib/actions/auth";
import { Field, Label, TextInput } from "@/components/form";
import { Button } from "@/components/ui";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, undefined);

  if (!token) {
    return (
      <div>
        <div className="text-[27px] font-semibold tracking-tight">Lien invalide</div>
        <div className="text-sm text-(--color-text-muted) mt-2.5 leading-relaxed">
          Ce lien de réinitialisation est incomplet. Refaites une demande.
        </div>
        <Link href="/mot-de-passe-oublie" className="block text-center text-(--color-primary) font-semibold mt-6 text-[13.5px]">
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[27px] font-semibold tracking-tight">Nouveau mot de passe</div>
      <div className="text-sm text-(--color-text-muted) mt-1.5">Choisissez un nouveau mot de passe pour votre compte.</div>

      <form action={formAction} className="grid gap-4 mt-6">
        <input type="hidden" name="token" value={token} />
        <Field>
          <Label>Nouveau mot de passe</Label>
          <TextInput name="password" type="password" placeholder="8 caractères minimum" required minLength={8} />
        </Field>

        {state?.error && (
          <div className="text-[13px] text-(--color-danger-text)">
            {state.error}{" "}
            <Link href="/mot-de-passe-oublie" className="underline font-semibold">
              Refaire une demande
            </Link>
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Mise à jour…" : "Mettre à jour le mot de passe"}
        </Button>
      </form>
    </div>
  );
}
