import Link from "next/link";

/** Shown after a form was captured offline instead of being sent. */
export function OfflineQueuedNotice({ label, backHref }: { label: string; backHref: string }) {
  return (
    <div className="rounded-[11px] border border-(--color-gold-border) bg-(--color-gold-bg) px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-(--color-gold-dot) shrink-0" />
        <span className="text-[13.5px] font-semibold text-(--color-gold-text)">Enregistré hors ligne</span>
      </div>
      <p className="text-[13px] text-(--color-text-secondary) leading-relaxed mt-1.5">
        « {label} » est conservé sur cet appareil et sera envoyé automatiquement dès le retour du réseau. Vous pouvez
        continuer à saisir.
      </p>
      <Link href={backHref} className="text-[13px] font-semibold text-(--color-primary) mt-2 inline-block">
        Retour à la liste →
      </Link>
    </div>
  );
}
