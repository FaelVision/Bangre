"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewReminderAction, confirmReminderSentAction } from "@/lib/actions/students";
import { buildWhatsAppLink } from "@/lib/whatsapp-link";
import { cn } from "@/lib/cn";

type Preview = { studentId: string; trancheId: string | null; phone: string; message: string; label: string };

export function ReminderButton({
  studentId,
  className,
  label = "Envoyer un rappel",
}: {
  studentId: string;
  className?: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [text, setText] = useState("");
  const router = useRouter();

  function open() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      alert("Rappel WhatsApp indisponible hors ligne.");
      return;
    }
    startTransition(async () => {
      const res = await previewReminderAction(studentId);
      if ("error" in res) {
        alert(res.error);
        return;
      }
      setPreview(res);
      setText(res.message);
    });
  }

  function send() {
    if (!preview) return;
    // Data (phone + text) is already loaded, so this is a plain synchronous
    // click — the browser never treats it as an unsolicited popup.
    window.open(buildWhatsAppLink(preview.phone, text), "_blank");
    startTransition(async () => {
      await confirmReminderSentAction(preview.studentId, preview.trancheId, text);
      router.refresh();
    });
    setPreview(null);
  }

  return (
    <>
      <button
        onClick={open}
        disabled={pending}
        className={cn(
          "h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center justify-center px-4 text-[13.5px] font-semibold cursor-pointer disabled:opacity-50",
          className
        )}
      >
        {pending && !preview ? "Préparation…" : label}
      </button>

      {preview && (
        <div
          className="fixed inset-0 bg-[#281C14]/42 flex items-center justify-center p-4 z-50"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-(--color-bg-app) rounded-[18px] shadow-2xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-semibold">Rappel WhatsApp · {preview.label}</div>
            <div className="text-[12.5px] text-(--color-text-muted) mt-0.5">Vers {preview.phone}</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="w-full mt-3.5 rounded-[10px] border border-(--color-border-strong) px-3.5 py-3 text-[13.5px] leading-relaxed focus:outline-none focus:border-(--color-primary)"
            />
            <div className="flex gap-2.5 mt-4">
              <button
                onClick={() => setPreview(null)}
                className="flex-1 h-[42px] rounded-[10px] border border-(--color-border-strong) bg-white text-[13.5px] font-semibold cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={send}
                disabled={text.trim().length === 0}
                className="flex-1 h-[42px] rounded-[10px] bg-(--color-primary) text-white text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
              >
                Ouvrir WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
