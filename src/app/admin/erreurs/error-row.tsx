"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { deleteErrorAction, resolveErrorAction } from "@/lib/actions/admin";

export function ErrorRow({
  id,
  message,
  stack,
  digest,
  route,
  path,
  method,
  source,
  kind,
  count,
  schoolName,
  firstSeen,
  lastSeen,
  resolved,
}: {
  id: string;
  message: string;
  stack: string | null;
  digest: string | null;
  route: string | null;
  path: string | null;
  method: string | null;
  source: string;
  kind: string | null;
  count: number;
  schoolName: string | null;
  firstSeen: string;
  lastSeen: string;
  resolved: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function toggleResolved() {
    startTransition(async () => {
      await resolveErrorAction(id, !resolved);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("Supprimer cette entrée du journal ? Elle réapparaîtra si l'erreur se reproduit.")) return;
    startTransition(async () => {
      await deleteErrorAction(id);
      router.refresh();
    });
  }

  return (
    <div
      className={`bg-white border rounded-2xl p-4 ${
        resolved ? "border-(--color-border) opacity-70" : "border-(--color-danger-border)"
      }`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-[240px]">
          <div className="text-[14px] font-semibold leading-snug break-words">{message}</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-(--color-text-muted) mt-1.5">
            {route && <span className="font-mono">{route}</span>}
            {path && path !== route && <span className="font-mono">{method ? `${method} ` : ""}{path}</span>}
            {schoolName && <span>école : {schoolName}</span>}
            {digest && <span className="font-mono">réf. {digest}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge tone={source === "client" ? "gold" : "danger"}>{source === "client" ? "navigateur" : "serveur"}</Badge>
          {kind && <Badge tone="neutral">{kind}</Badge>}
          <Badge tone={count > 1 ? "danger" : "neutral"}>{count}×</Badge>
        </div>
      </div>

      <div className="text-[12px] text-(--color-text-muted) mt-2.5">
        Première fois {firstSeen} · dernière fois <b className="text-(--color-text-secondary)">{lastSeen}</b>
        {resolved && <span className="text-(--color-success-text) font-semibold"> · marquée résolue</span>}
      </div>

      {stack && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[12.5px] font-semibold text-(--color-primary) mt-2.5 cursor-pointer"
          >
            {open ? "Masquer le détail technique" : "Voir le détail technique"}
          </button>
          {open && (
            <pre className="mt-2 text-[11.5px] leading-relaxed bg-(--color-bg-subtle) border border-(--color-border) rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-[280px]">
              {stack}
            </pre>
          )}
        </>
      )}

      <div className="flex gap-2 mt-3.5">
        <button
          type="button"
          onClick={toggleResolved}
          disabled={pending}
          className="h-9 rounded-[9px] border border-(--color-border-strong) bg-white px-3.5 text-[13px] font-semibold cursor-pointer disabled:opacity-50"
        >
          {resolved ? "Rouvrir" : "Marquer résolue"}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="h-9 rounded-[9px] border border-(--color-border-strong) bg-white px-3.5 text-[13px] font-semibold text-(--color-danger-text) cursor-pointer disabled:opacity-50"
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}
