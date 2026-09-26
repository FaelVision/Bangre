"use client";

import { useEffect, useState } from "react";
import {
  canReloadIntoOfflineApp,
  isConnectivityError,
  reloadIntoOfflineApp,
  reportClientError,
} from "@/lib/error-recovery";

/**
 * A screen of the app that failed. The sidebar stays, and the rest of the app
 * with it — before this, any failure replaced the whole application with the
 * global error page.
 *
 * Most failures in a school are the network going away mid-way: those are not
 * shown as errors at all, the page reloads into the offline app.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const network = isConnectivityError(error);
  const [recovering] = useState(() => network && canReloadIntoOfflineApp());

  useEffect(() => {
    if (recovering) return reloadIntoOfflineApp();
    if (network) return;
    reportClientError(error);
  }, [error, network, recovering]);

  if (recovering) {
    return (
      <div className="p-4 lg:p-8 text-[13.5px] text-(--color-text-muted)">
        Connexion perdue — ouverture des données de cet appareil…
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-[480px] rounded-2xl border border-(--color-border) bg-white p-5">
        <div className="text-[15px] font-semibold">
          {network ? "Pas de connexion au serveur" : "Cet écran n'a pas pu s'afficher"}
        </div>
        <p className="text-[13px] text-(--color-text-secondary) leading-relaxed mt-1.5">
          {network
            ? "Le reste de Bangré fonctionne avec les données de cet appareil. Vos saisies sont gardées et partiront au retour du réseau."
            : "L'incident a été signalé automatiquement. Vos données ne sont pas affectées."}
        </p>
        <div className="flex gap-2.5 mt-4">
          <button
            type="button"
            onClick={() => (network ? window.location.reload() : retry())}
            className="h-[38px] rounded-[9px] bg-(--color-primary) text-white px-4 text-[13.5px] font-semibold cursor-pointer"
          >
            Réessayer
          </button>
          <a
            href="/tableau-de-bord"
            className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline"
          >
            Tableau de bord
          </a>
        </div>
        {error.digest && !network && (
          <div className="text-[12px] text-(--color-text-muted) mt-3 font-mono">Référence : {error.digest}</div>
        )}
      </div>
    </div>
  );
}
