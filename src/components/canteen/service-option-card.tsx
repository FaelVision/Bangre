"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setServiceEnabledAction } from "@/lib/actions/canteen";
import { isNetworkError, withNetwork } from "@/lib/connectivity";
import { serviceInfo, type SchoolService } from "@/lib/services";
import { Badge, Card } from "@/components/ui";
import { cn } from "@/lib/cn";

/** One option of the school, with its on/off switch. Turned on without prices, it leads to them. */
export function ServiceOptionCard({
  service,
  enabled,
  description,
}: {
  service: SchoolService;
  enabled: boolean;
  description: string;
}) {
  const info = serviceInfo(service);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await withNetwork(() => setServiceEnabledAction(service, !enabled), 15000);
        if (res.needsPrices) router.push(`${info.path}/reglages`);
        else router.refresh();
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        setError("Pas de connexion : les options s'activent en ligne. Réessayez au retour du réseau.");
      }
    });
  }

  return (
    <Card>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2">
            <div className="text-[15.5px] font-semibold">{info.title}</div>
            {enabled ? <Badge tone="success">Activée</Badge> : <Badge tone="neutral">Désactivée</Badge>}
          </div>
          <p className="text-[13px] text-(--color-text-secondary) leading-relaxed mt-1.5">{description}</p>
        </div>
        <div className="flex gap-2 items-center">
          {enabled && (
            <Link
              href={`${info.path}/reglages`}
              className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-3.5 text-[13px] font-semibold no-underline hover:no-underline"
            >
              Tarifs
            </Link>
          )}
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className={cn(
              "h-[38px] rounded-[9px] px-4 text-[13px] font-semibold cursor-pointer disabled:opacity-50",
              enabled
                ? "border border-(--color-danger-border) bg-white text-(--color-danger-text)"
                : "bg-(--color-primary) text-white"
            )}
          >
            {pending ? "…" : enabled ? "Désactiver" : "Activer"}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-(--color-danger-text) mt-2.5">
          {error}
        </p>
      )}
    </Card>
  );
}
