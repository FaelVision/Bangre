"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendReminderAction } from "@/lib/actions/students";
import { queueRemindersIfOffline } from "@/lib/offline-queue";
import { cn } from "@/lib/cn";

export function ReminderButton({
  studentId,
  studentLabel,
  className,
  label = "Envoyer un rappel",
}: {
  studentId: string;
  studentLabel?: string;
  className?: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          if (await queueRemindersIfOffline([{ id: studentId, label: studentLabel ?? "élève" }])) {
            alert("Hors ligne : le rappel sera envoyé automatiquement à la reconnexion.");
            return;
          }
          const res = await sendReminderAction(studentId);
          if (res?.error) alert(res.error);
          router.refresh();
        })
      }
      disabled={pending}
      className={cn(
        "h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center justify-center px-4 text-[13.5px] font-semibold cursor-pointer disabled:opacity-50",
        className
      )}
    >
      {pending ? "Envoi…" : label}
    </button>
  );
}
