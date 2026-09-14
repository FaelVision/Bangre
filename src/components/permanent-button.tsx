"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSchoolPermanentAction } from "@/lib/actions/admin";
import { Button, Badge } from "@/components/ui";

/** Compact "rendre permanent" action for a table row — see SchoolActions for the full detail-page version. */
export function PermanentButton({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function makePermanent() {
    if (!confirm(`Rendre l'accès de « ${schoolName} » permanent (abonnement toujours actif, sans échéance) ?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await setSchoolPermanentAction(schoolId);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={makePermanent}>
        {pending ? "…" : "Rendre permanent"}
      </Button>
      {error && <div className="text-[11px] text-(--color-danger-text)">{error}</div>}
    </div>
  );
}

export function PermanentBadge() {
  return <Badge tone="success">Permanent</Badge>;
}
