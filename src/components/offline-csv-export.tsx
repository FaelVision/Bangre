"use client";

import type { LateRow } from "@/components/late-table";
import { formatDate } from "@/lib/format";

function csvEscape(value: string) {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * The retards list as an Excel file, written on the device: the same columns
 * as `/api/retards/csv`, from the rows already on screen, so the call list can
 * be printed or shared with no network.
 */
export function OfflineCsvExport({ rows }: { rows: LateRow[] }) {
  function download() {
    const header = ["Matricule", "Nom", "Prenom", "Classe", "Parent", "Numero", "Tranches dues", "Montant du", "Statut WhatsApp"];
    const lines = [header.join(";")];
    for (const r of rows) {
      lines.push(
        [
          r.matricule,
          r.lastName,
          r.firstName,
          r.className,
          r.parentName ?? "",
          r.parentPhone ?? "",
          r.overdueLabel,
          String(r.overdueAmount),
          r.whatsappStatus,
        ]
          .map((v) => csvEscape(String(v)))
          .join(";")
      );
    }

    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `retards-${formatDate(new Date()).replace(/\//g, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold cursor-pointer"
    >
      Export Excel
    </button>
  );
}
