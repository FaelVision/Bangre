"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatAmount, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui";
import { bulkSendReminderAction } from "@/lib/actions/students";
import { PayButton } from "@/components/pay-button";

export type LateRow = {
  id: string;
  lastName: string;
  firstName: string;
  className: string;
  parentName: string | null;
  parentPhone: string | null;
  whatsappStatus: string;
  overdueLabel: string;
  overdueAmount: number;
  lastReminder: { sentAt: Date; status: string } | null;
};

export function LateTable({ rows }: { rows: LateRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  function sendSelected() {
    startTransition(async () => {
      const res = await bulkSendReminderAction(Array.from(selected));
      if (res && "sent" in res) alert(`${res.sent} rappel(s) envoyé(s) sur ${res.total}.`);
      setSelected(new Set());
      router.refresh();
    });
  }

  const selectedAmount = rows.filter((r) => selected.has(r.id)).reduce((s, r) => s + r.overdueAmount, 0);

  return (
    <div className="bg-white border border-(--color-border) rounded-2xl overflow-x-auto">
      <table className="w-full" style={{ minWidth: 1080 }}>
        <thead>
          <tr className="bg-(--color-bg-subtle)">
            <th className="w-[42px] py-3 pl-4">
              <input
                type="checkbox"
                checked={selected.size > 0 && selected.size === rows.length}
                onChange={toggleAll}
                className="w-[17px] h-[17px] rounded-[5px] accent-(--color-primary)"
              />
            </th>
            <Th>Élève</Th>
            <Th>Classe</Th>
            <Th>Parent</Th>
            <Th>Numéro</Th>
            <Th>Tranches dues</Th>
            <Th align="right">Montant dû</Th>
            <Th>Rappel</Th>
            <th className="py-3 pr-4 pl-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t border-(--color-border-row)" style={{ background: i % 2 === 1 ? "var(--color-bg-zebra)" : undefined }}>
              <td className="py-3 pl-4">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  className="w-[17px] h-[17px] rounded-[5px] accent-(--color-primary)"
                />
              </td>
              <Td className="font-semibold">
                <Link href={`/eleves/${r.id}`} className="text-(--color-text) no-underline hover:underline">
                  {r.lastName} {r.firstName}
                </Link>
              </Td>
              <Td>{r.className}</Td>
              <Td>{r.parentName ?? "—"}</Td>
              <Td className="tabular-nums">
                {r.parentPhone ?? <span className="italic text-(--color-text-placeholder)">non renseigné</span>}
              </Td>
              <Td>{r.overdueLabel}</Td>
              <Td align="right" className="font-semibold tabular-nums">
                {formatAmount(r.overdueAmount)}
              </Td>
              <td className="py-3 px-3">
                {r.whatsappStatus !== "reachable" ? (
                  <Badge tone="danger">
                    {r.whatsappStatus === "invalid" ? "Numéro invalide · à appeler" : "Pas sur WhatsApp · à appeler"}
                  </Badge>
                ) : r.lastReminder ? (
                  <Badge tone={r.lastReminder.status === "read" ? "success" : "gold"}>
                    {r.lastReminder.status === "read" ? "Lu" : "WhatsApp"} · {formatDate(r.lastReminder.sentAt)}
                  </Badge>
                ) : (
                  <Badge tone="neutral">Aucun rappel</Badge>
                )}
              </td>
              <td className="py-3 pr-4 pl-3 text-right">
                <PayButton
                  studentId={r.id}
                  hint={`${r.lastName} ${r.firstName} · ${r.className}`}
                  className="text-[12.5px] text-(--color-primary) font-semibold hover:underline"
                >
                  Encaisser
                </PayButton>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center text-(--color-text-muted) py-8 text-sm">
                Aucun élève en retard pour ces critères.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-(--color-border) bg-(--color-bg-subtle)">
          <span className="text-[13px] text-(--color-text-mutedalt)">
            Sélection : {selected.size} élève(s) · <b className="tabular-nums">{formatAmount(selectedAmount)} CFA</b>
          </span>
          <button
            onClick={sendSelected}
            disabled={pending}
            className="h-8 rounded-lg border border-(--color-border-strong) bg-white px-3 text-[12.5px] font-semibold cursor-pointer disabled:opacity-50"
          >
            Rappel WhatsApp
          </button>
          <a
            href={`/api/retards/pdf?ids=${Array.from(selected).join(",")}`}
            target="_blank"
            className="h-8 rounded-lg border border-(--color-border-strong) bg-white px-3 text-[12.5px] font-semibold flex items-center no-underline hover:no-underline"
          >
            Liste d&apos;appels (PDF)
          </a>
        </div>
      )}
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className="text-[11.5px] uppercase tracking-wider text-(--color-text-muted) py-3 px-3 font-semibold" style={{ textAlign: align }}>
      {children}
    </th>
  );
}
function Td({ children, align = "left", className = "" }: { children: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <td className={`py-3 px-3 text-[13.5px] ${className}`} style={{ textAlign: align }}>
      {children}
    </td>
  );
}
