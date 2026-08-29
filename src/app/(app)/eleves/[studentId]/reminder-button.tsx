"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendReminderAction } from "@/lib/actions/students";
import { cn } from "@/lib/cn";

export function ReminderButton({ studentId, className, label = "Envoyer un rappel" }: { studentId: string; className?: string; label?: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
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
