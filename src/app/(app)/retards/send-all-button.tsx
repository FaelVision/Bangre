"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkSendReminderAction } from "@/lib/actions/students";

export function SendAllRemindersButton({ studentIds }: { studentIds: string[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const res = await bulkSendReminderAction(studentIds);
          if (res && "sent" in res) alert(`${res.sent} rappel(s) WhatsApp envoyé(s) sur ${res.total}.`);
          router.refresh();
        })
      }
      disabled={pending || studentIds.length === 0}
      className="h-[38px] rounded-[9px] bg-(--color-success-text) text-white flex items-center px-4 text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
    >
      {pending ? "Envoi…" : `Envoyer les rappels · ${studentIds.length}`}
    </button>
  );
}
