"use client";

import { useState, useTransition } from "react";
import { bulkPreviewRemindersAction } from "@/lib/actions/students";
import { WhatsAppQueueModal, type PreparedReminder } from "@/components/whatsapp-queue-modal";

export function SendAllRemindersButton({ students }: { students: { id: string; label: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [queue, setQueue] = useState<{ items: PreparedReminder[]; skipped: number } | null>(null);

  return (
    <>
      <button
        onClick={() => {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            alert("Rappels WhatsApp indisponibles hors ligne.");
            return;
          }
          startTransition(async () => {
            const res = await bulkPreviewRemindersAction(students.map((s) => s.id));
            setQueue({ items: res.prepared, skipped: res.skipped });
          });
        }}
        disabled={pending || students.length === 0}
        className="h-[38px] rounded-[9px] bg-(--color-success-text) text-white flex items-center px-4 text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
      >
        {pending ? "Préparation…" : `Envoyer les rappels · ${students.length}`}
      </button>
      {queue && (
        <WhatsAppQueueModal items={queue.items} skipped={queue.skipped} onClose={() => setQueue(null)} />
      )}
    </>
  );
}
