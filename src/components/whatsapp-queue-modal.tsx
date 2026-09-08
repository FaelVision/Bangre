"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmReminderSentAction } from "@/lib/actions/students";
import { buildWhatsAppLink } from "@/lib/whatsapp-link";

export type PreparedReminder = {
  studentId: string;
  trancheId: string | null;
  label: string;
  phone: string;
  message: string;
};

/**
 * Shown after a bulk "Envoyer les rappels" click. Each family got its message
 * pre-built server-side from their current situation; this lets the user tap
 * through them one by one — review or edit, then open WhatsApp already
 * filled in. WhatsApp has no real bulk-send: this is as close as a plain
 * wa.me link gets, one click per family.
 */
export function WhatsAppQueueModal({
  items,
  skipped,
  onClose,
}: {
  items: PreparedReminder[];
  skipped: number;
  onClose: () => void;
}) {
  const [sent, setSent] = useState<Set<string>>(new Set());

  return (
    <div
      className="fixed inset-0 bg-[#281C14]/42 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-(--color-bg-app) rounded-[18px] shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-(--color-border) flex items-center justify-between">
          <div>
            <div className="text-[15px] font-semibold">Rappels à envoyer</div>
            <div className="text-[12.5px] text-(--color-text-muted) mt-0.5">
              {sent.size}/{items.length} ouvert(s)
              {skipped > 0 ? ` · ${skipped} ignoré(s) (à jour ou sans numéro)` : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-[9px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[15px] text-(--color-text-mutedalt) cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="p-3 grid gap-1.5 overflow-y-auto">
          {items.length === 0 && (
            <div className="text-[13.5px] text-(--color-text-muted) text-center py-6">
              Aucun rappel à envoyer — tout le monde est à jour ou sans numéro WhatsApp.
            </div>
          )}
          {items.map((item) => (
            <Row key={item.studentId} item={item} sent={sent.has(item.studentId)} onSent={() => setSent((prev) => new Set(prev).add(item.studentId))} />
          ))}
        </div>

        <div className="px-5 py-3.5 border-t border-(--color-border)">
          <button
            onClick={onClose}
            className="w-full h-[42px] rounded-[10px] bg-(--color-primary) text-white text-[13.5px] font-semibold cursor-pointer"
          >
            Terminé
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ item, sent, onSent }: { item: PreparedReminder; sent: boolean; onSent: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.message);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function open() {
    // text is already loaded client-side, so this stays a plain synchronous
    // click — no async gap for the browser to treat as an unsolicited popup.
    window.open(buildWhatsAppLink(item.phone, text), "_blank");
    onSent();
    setEditing(false);
    startTransition(async () => {
      await confirmReminderSentAction(item.studentId, item.trancheId, text);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="rounded-[11px] px-3.5 py-3 bg-white border border-(--color-primary)">
        <div className="text-[13.5px] font-semibold mb-2">{item.label}</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="w-full rounded-[9px] border border-(--color-border-strong) px-3 py-2 text-[13px] leading-relaxed focus:outline-none focus:border-(--color-primary)"
        />
        <div className="flex gap-2 mt-2.5">
          <button
            onClick={() => setEditing(false)}
            className="flex-1 h-9 rounded-[9px] border border-(--color-border-strong) bg-white text-[12.5px] font-semibold cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={open}
            disabled={text.trim().length === 0}
            className="flex-1 h-9 rounded-[9px] bg-(--color-primary) text-white text-[12.5px] font-semibold cursor-pointer disabled:opacity-50"
          >
            Ouvrir WhatsApp
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-[11px] px-3.5 py-3 bg-white border border-(--color-border-strong)">
      <span className="text-[13.5px] font-semibold">{item.label}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="h-8 rounded-lg border border-(--color-border-strong) bg-white px-2.5 text-[12px] font-semibold cursor-pointer"
        >
          Modifier
        </button>
        <button
          onClick={open}
          className={`h-8 rounded-lg px-2.5 text-[12px] font-semibold cursor-pointer ${
            sent ? "bg-(--color-success-bg) text-(--color-success-text)" : "bg-(--color-primary) text-white"
          }`}
        >
          {sent ? "Ouvert ✓" : "Ouvrir WhatsApp"}
        </button>
      </div>
    </div>
  );
}
