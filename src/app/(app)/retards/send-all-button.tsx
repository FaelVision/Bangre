"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkSendReminderAction } from "@/lib/actions/students";
import { queueRemindersIfOffline } from "@/lib/offline-queue";

export function SendAllRemindersButton({ students }: { students: { id: string; label: string }[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          if (await queueRemindersIfOffline(students)) {
            alert(`Hors ligne : ${students.length} rappel(s) seront envoyés à la reconnexion.`);
            return;
          }
          const res = await bulkSendReminderAction(students.map((s) => s.id));
          if (res && "sent" in res) alert(`${res.sent} rappel(s) WhatsApp envoyé(s) sur ${res.total}.`);
          router.refresh();
        })
      }
      disabled={pending || students.length === 0}
      className="h-[38px] rounded-[9px] bg-(--color-success-text) text-white flex items-center px-4 text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
    >
      {pending ? "Envoi…" : `Envoyer les rappels · ${students.length}`}
    </button>
  );
}
