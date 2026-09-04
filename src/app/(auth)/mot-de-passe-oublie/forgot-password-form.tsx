"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/lib/actions/auth";
import { Field, Label, TextInput } from "@/components/form";
import { Button } from "@/components/ui";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, undefined);

  if (state?.ok) {
    return (
      <div>
        <div className="text-[27px] font-semibold tracking-tight">Vérifiez votre WhatsApp ou vos e-mails</div>
        <div className="text-sm text-(--color-text-muted) mt-2.5 leading-relaxed">
          Si un compte correspond, un lien de réinitialisation valable une heure vient d&apos;être envoyé.
        </div>

        {state.mockLink && (
          <div className="text-[13px] bg-(--color-gold-bg) border border-[#E7C9A8] rounded-lg px-3.5 py-3 mt-5 leading-relaxed break-all">
            <div className="font-semibold mb-1">Mode simulation</div>
            Aucun fournisseur WhatsApp/e-mail n&apos;est configuré sur ce serveur : voici le lien directement —{" "}
            <a href={state.mockLink} className="text-(--color-primary) underline">
              {state.mockLink}
            </a>
          </div>
        )}

        <Link href="/connexion" className="block text-center text-(--color-primary) font-semibold mt-6 text-[13.5px]">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[27px] font-semibold tracking-tight">Mot de passe oublié</div>
      <div className="text-sm text-(--color-text-muted) mt-1.5">
        Indiquez le téléphone ou l&apos;e-mail de votre compte, nous vous enverrons un lien de réinitialisation.
      </div>

      <form action={formAction} className="grid gap-4 mt-6">
        <Field>
          <Label>Téléphone ou e-mail</Label>
          <TextInput name="identifier" placeholder="+226 70 11 22 33 ou contact@ecole.bf" required />
        </Field>

        {state?.error && <div className="text-[13px] text-(--color-danger-text)">{state.error}</div>}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Envoi…" : "Envoyer le lien"}
        </Button>

        <div className="text-center text-[13.5px] text-(--color-text-muted)">
          <Link href="/connexion" className="text-(--color-primary) font-semibold">
            Retour à la connexion
          </Link>
        </div>
      </form>
    </div>
  );
}
