import Link from "next/link";

/**
 * Shown by the service worker when a page was never cached and the network is
 * unreachable. Kept dependency-free so it renders from cache with no data.
 */
export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-(--color-bg-page) flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-[440px] bg-white border border-(--color-border) rounded-2xl p-6">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-(--color-gold-dot)" />
          <span className="text-[13px] font-semibold text-(--color-gold-text)">Hors ligne</span>
        </div>

        <div className="text-[19px] font-semibold tracking-tight mt-3">Cette page n&apos;est pas encore disponible hors ligne</div>

        <p className="text-[13.5px] text-(--color-text-secondary) leading-relaxed mt-2.5">
          Bangre garde en mémoire les pages déjà consultées depuis cet appareil. Celle-ci ne l&apos;a pas encore été.
          Revenez au tableau de bord, ou reconnectez-vous au réseau.
        </p>

        <div className="rounded-[11px] border border-(--color-success-border) bg-(--color-success-bg-soft) px-4 py-3 mt-4">
          <div className="text-[13px] font-semibold text-(--color-success-text-dark)">Vos saisies ne sont pas perdues</div>
          <p className="text-[12.5px] text-(--color-text-secondary) leading-relaxed mt-1">
            Les paiements et les fiches élèves enregistrés sans réseau restent sur cet appareil et partent
            automatiquement dès le retour de la connexion.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 mt-5">
          <Link
            href="/tableau-de-bord"
            className="flex-1 h-[42px] rounded-[10px] bg-(--color-primary) text-white flex items-center justify-center text-[13.5px] font-semibold no-underline hover:no-underline"
          >
            Tableau de bord
          </Link>
          <Link
            href="/eleves"
            className="flex-1 h-[42px] rounded-[10px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[13.5px] font-semibold no-underline hover:no-underline"
          >
            Élèves
          </Link>
        </div>
      </div>
    </div>
  );
}
