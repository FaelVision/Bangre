"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatAmount, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui";
import { bulkSendReminderAction, bulkChangeClassAction } from "@/lib/actions/students";
import type { StudentSummary } from "@/lib/tuition";

export type StudentRow = {
  id: string;
  matricule: string;
  lastName: string;
  firstName: string;
  birthDate: Date | null;
  parentPhone: string | null;
  className: string;
  summary: StudentSummary;
};

const statusTone: Record<StudentSummary["status"], "success" | "gold" | "danger" | "neutral"> = {
  solde: "success",
  partiel: "gold",
  retard: "danger",
  attente: "neutral",
  non_defini: "neutral",
};

export function StudentsTable({
  students,
  showClassColumn,
  classOptions,
}: {
  students: StudentRow[];
  showClassColumn: boolean;
  classOptions?: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [moveTarget, setMoveTarget] = useState("");
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
    setSelected((prev) => (prev.size === students.length ? new Set() : new Set(students.map((s) => s.id))));
  }

  function sendReminders() {
    startTransition(async () => {
      const res = await bulkSendReminderAction(Array.from(selected));
      if (res && "sent" in res) {
        alert(`${res.sent} rappel(s) WhatsApp envoyé(s) sur ${res.total}.`);
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  function changeClass() {
    if (!moveTarget) return;
    startTransition(async () => {
      await bulkChangeClassAction(Array.from(selected), moveTarget);
      setSelected(new Set());
      setMoveTarget("");
      router.refresh();
    });
  }

  return (
    <div className="bg-white border border-(--color-border) rounded-2xl overflow-x-auto">
      <table className="w-full" style={{ minWidth: showClassColumn ? 1080 : 920 }}>
        <thead>
          <tr className="bg-(--color-bg-subtle)">
            <th className="w-[42px] py-3 pl-4">
              <input
                type="checkbox"
                checked={selected.size > 0 && selected.size === students.length}
                onChange={toggleAll}
                className="w-[17px] h-[17px] rounded-[5px] accent-(--color-primary)"
              />
            </th>
            <Th>Matricule</Th>
            <Th>Nom</Th>
            <Th>Prénom</Th>
            {showClassColumn && <Th>Classe</Th>}
            <Th>Naissance</Th>
            <Th>Numéro du parent</Th>
            <Th align="right">Payé / total</Th>
            <Th>Statut</Th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => (
            <tr
              key={s.id}
              className="border-t border-(--color-border-row)"
              style={{ background: i % 2 === 1 ? "var(--color-bg-zebra)" : undefined }}
            >
              <td className="py-3 pl-4">
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="w-[17px] h-[17px] rounded-[5px] accent-(--color-primary)"
                />
              </td>
              <Td className="text-(--color-text-mutedalt) tabular-nums">{s.matricule}</Td>
              <Td className="font-semibold">
                <Link href={`/eleves/${s.id}`} className="text-(--color-text) no-underline hover:underline">
                  {s.lastName}
                </Link>
              </Td>
              <Td>{s.firstName}</Td>
              {showClassColumn && <Td>{s.className}</Td>}
              <Td className="tabular-nums text-(--color-text-secondary)">{formatDate(s.birthDate)}</Td>
              <Td className="tabular-nums text-(--color-text-secondary)">
                {s.parentPhone ?? <span className="italic text-(--color-text-placeholder)">non renseigné</span>}
              </Td>
              <Td align="right" className="tabular-nums">
                {formatAmount(s.summary.paid)} / {formatAmount(s.summary.total)}
              </Td>
              <td className="py-3 pr-4 pl-3">
                <Badge tone={statusTone[s.summary.status]}>{s.summary.statusLabel}</Badge>
              </td>
            </tr>
          ))}
          {students.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center text-(--color-text-muted) py-8 text-sm">
                Aucun élève ne correspond à ces critères.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-(--color-border) bg-(--color-bg-subtle) flex-wrap">
          <span className="text-[13px] text-(--color-text-mutedalt)">{selected.size} élève(s) sélectionné(s)</span>
          <button
            onClick={sendReminders}
            disabled={pending}
            className="h-8 rounded-lg border border-(--color-border-strong) bg-white px-3 text-[12.5px] font-semibold cursor-pointer disabled:opacity-50"
          >
            Envoyer un rappel WhatsApp
          </button>
          {classOptions && (
            <div className="flex items-center gap-1.5">
              <select
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value)}
                className="h-8 rounded-lg border border-(--color-border-strong) bg-white px-2 text-[12.5px]"
              >
                <option value="">Changer de classe…</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={changeClass}
                disabled={pending || !moveTarget}
                className="h-8 rounded-lg border border-(--color-border-strong) bg-white px-3 text-[12.5px] font-semibold cursor-pointer disabled:opacity-50"
              >
                Appliquer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="text-[11.5px] uppercase tracking-wider text-(--color-text-muted) py-3 px-3 font-semibold"
      style={{ textAlign: align }}
    >
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
