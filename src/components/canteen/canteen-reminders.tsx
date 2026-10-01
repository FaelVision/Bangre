"use client";

import { useState, useTransition } from "react";
import { WhatsAppQueueModal } from "@/components/whatsapp-queue-modal";
import { confirmCanteenReminder, prepareCanteenReminders } from "@/lib/canteen-client";
import type { PreparedCanteenReminder } from "@/lib/canteen-overview";
import { cn } from "@/lib/cn";

/**
 * Rappels WhatsApp for late canteen months — one family or all of them. Same
 * flow as the tuition rappels: the message is prepared, the user reviews it,
 * opens WhatsApp, and the rappel is recorded (offline: queued).
 */
export function CanteenRemindersButton({
  students,
  label,
  className,
}: {
  students: { id: string; label: string }[];
  label?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [queue, setQueue] = useState<{ items: PreparedCanteenReminder[]; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const single = students.length === 1;

  function open() {
    setError(null);
    startTransition(async () => {
      const res = await prepareCanteenReminders(students.map((s) => s.id));
      // One family with nothing to send: say why instead of an empty list.
      if (single && res.prepared.length === 0) {
        setError(res.error ?? "Aucun rappel à envoyer.");
        return;
      }
      setQueue({ items: res.prepared, skipped: res.skipped });
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={pending || students.length === 0}
        className={cn(
          single
            ? "h-8 rounded-lg border border-(--color-border-strong) bg-white px-2.5 text-[12px] font-semibold"
            : "h-[38px] rounded-[9px] bg-(--color-success-text) text-white flex items-center px-4 text-[13.5px] font-semibold",
          "cursor-pointer disabled:opacity-50",
          className
        )}
      >
        {pending ? "Préparation…" : (label ?? (single ? "Rappel" : `Envoyer les rappels · ${students.length}`))}
      </button>
      {error && (
        <span role="alert" className="block text-[12px] text-(--color-danger-text) mt-1">
          {error}
        </span>
      )}
      {queue && (
        <WhatsAppQueueModal
          items={queue.items}
          skipped={queue.skipped}
          confirm={confirmCanteenReminder}
          onClose={() => setQueue(null)}
        />
      )}
    </>
  );
}
