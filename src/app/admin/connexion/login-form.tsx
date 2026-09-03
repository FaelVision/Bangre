"use client";

import { useActionState } from "react";
import { adminLoginAction } from "@/lib/actions/admin";
import { Field, Label, TextInput } from "@/components/form";
import { Button } from "@/components/ui";

export function AdminLoginForm({ hasAdmin }: { hasAdmin: boolean }) {
  const [state, formAction, pending] = useActionState(adminLoginAction, undefined);

  return (
    <div className="min-h-screen bg-[#12100E] text-[#F7EFE4] flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-(--color-primary) text-white flex items-center justify-center text-sm font-bold">
            B
          </span>
          <div className="text-[17px] font-semibold tracking-tight">Bangre · Administration</div>
        </div>

        <div className="text-[25px] font-semibold tracking-tight mt-8">Espace administrateur</div>
        <div className="text-[13.5px] text-[#F7EFE4]/60 mt-1.5">
          Réservé à l&apos;exploitant de la plateforme, pas aux établissements.
        </div>

        {!hasAdmin ? (
          <div className="mt-7 rounded-xl border border-[#D8B45C]/35 bg-[#D8B45C]/10 px-4 py-3.5 text-[13px] leading-relaxed text-[#EBD9BC]">
            Aucun compte administrateur n&apos;existe encore. Créez-en un depuis le terminal :
            <div className="mt-2.5 font-mono text-[12px] bg-black/30 rounded-lg px-3 py-2 break-all">
              npm run admin:create -- &quot;+226 70 00 00 00&quot; &quot;Votre nom&quot;
            </div>
            <div className="mt-2">La commande affiche un mot de passe à usage unique.</div>
          </div>
        ) : (
          <form action={formAction} className="grid gap-4 mt-7">
            <Field>
              <Label>
                <span className="text-[#F7EFE4]/70">Téléphone</span>
              </Label>
              <TextInput
                name="phone"
                type="tel"
                placeholder="+226 70 00 00 00"
                required
                className="bg-white/6 border-white/15 text-[#F7EFE4] placeholder:text-[#F7EFE4]/35"
              />
            </Field>
            <Field>
              <Label>
                <span className="text-[#F7EFE4]/70">Mot de passe</span>
              </Label>
              <TextInput
                name="password"
                type="password"
                placeholder="••••••••"
                required
                className="bg-white/6 border-white/15 text-[#F7EFE4] placeholder:text-[#F7EFE4]/35"
              />
            </Field>

            {state?.error && (
              <div className="text-[13px] text-[#F1A9B6] bg-[#9E1B32]/20 border border-[#9E1B32]/40 rounded-lg px-3.5 py-2.5">
                {state.error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? "Connexion…" : "Ouvrir l'administration"}
            </Button>
          </form>
        )}

        <a href="/connexion" className="block text-center text-[13px] text-[#F7EFE4]/50 mt-7 no-underline hover:no-underline">
          ← Accès établissement
        </a>
      </div>
    </div>
  );
}
