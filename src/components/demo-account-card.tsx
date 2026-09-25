"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetDemoSchoolAction } from "@/lib/actions/admin";
import { Badge, Button, Card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { DemoSchoolSummary } from "@/lib/demo-school";

/**
 * The presentation account, in the admin panel: one button to rebuild it from
 * scratch, so the same demo can be shown to a second prospect an hour later
 * without the first one's test payments still on screen.
 */
export function DemoAccountCard({
  summary,
  credentials,
}: {
  summary: DemoSchoolSummary;
  credentials: { name: string; email: string; phone: string; password: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    const question = summary.exists
      ? `Réinitialiser le compte de démonstration « ${credentials.name} » ? Tout ce qui y a été saisi pendant les présentations sera effacé et remplacé par un jeu de données neuf. Les autres établissements ne sont pas touchés.`
      : `Créer le compte de démonstration « ${credentials.name} » ?`;
    if (!confirm(question)) return;

    setError(null);
    setReport(null);
    startTransition(async () => {
      const res = await resetDemoSchoolAction();
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setReport(`Démo prête : ${res.students} élèves, ${res.classes} classes, ${res.payments} reçus.`);
      router.refresh();
    });
  }

  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="text-[15px] font-semibold">Compte de démonstration</div>
        {summary.exists ? <Badge tone="success">Prêt</Badge> : <Badge tone="gold">Pas encore créé</Badge>}
        <div className="flex-1" />
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={reset}>
          {pending ? "Préparation…" : summary.exists ? "Réinitialiser la démo" : "Créer le compte démo"}
        </Button>
      </div>

      <div className="text-[12.5px] text-(--color-text-muted) mt-1.5 leading-relaxed">
        Un établissement complet et crédible — classes, élèves, tranches, encaissements du jour, retards et parents à
        appeler — à montrer aux clients potentiels. Il n&apos;expire jamais et vit à part : le réinitialiser n&apos;a
        aucun effet sur les vraies écoles.
      </div>

      <div className="grid gap-2 mt-3.5 sm:grid-cols-2">
        <Field label="Établissement" value={credentials.name} />
        <Field label="Mot de passe" value={credentials.password} mono />
        <Field label="E-mail de connexion" value={credentials.email} mono />
        <Field label="Téléphone de connexion" value={credentials.phone} mono />
      </div>

      {summary.exists && (
        <div className="text-[12.5px] text-(--color-text-muted) mt-3">
          {summary.students} élèves · {summary.payments} paiements · créé le {formatDateTime(summary.createdAt)}
        </div>
      )}

      {report && <div className="text-[12.5px] text-(--color-success-text) mt-2 font-semibold">{report}</div>}
      {error && <div className="text-[12.5px] text-(--color-danger-text) mt-2">{error}</div>}
    </Card>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[10px] border border-(--color-border) bg-(--color-bg-subtle) px-3.5 py-2.5">
      <div className="text-[11.5px] text-(--color-text-muted)">{label}</div>
      <div className={`text-[13.5px] font-semibold mt-0.5 ${mono ? "tabular-nums" : ""}`}>{value}</div>
    </div>
  );
}
