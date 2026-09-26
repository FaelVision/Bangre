"use client";

import { useEffect, useState } from "react";
import {
  canReloadIntoOfflineApp,
  isConnectivityError,
  reloadIntoOfflineApp,
  reportClientError,
} from "@/lib/error-recovery";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // The network going away is not an error to show: the same address, loaded
  // again, opens in the offline app.
  const network = isConnectivityError(error);
  const [recovering] = useState(() => network && canReloadIntoOfflineApp());

  useEffect(() => {
    if (recovering) return reloadIntoOfflineApp();
    if (network) return;
    // Report to the admin error log. Fire-and-forget: the page is already
    // broken, a failed report must not make it worse.
    reportClientError(error);
  }, [error, network, recovering]);

  if (recovering) {
    return (
      <html lang="fr">
        <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#EFEAE1", color: "#4A443C" }}>
          <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
            Connexion perdue — ouverture des données de cet appareil…
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#EFEAE1", color: "#221E1A" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div
            style={{
              maxWidth: 460,
              width: "100%",
              background: "#fff",
              border: "1px solid #EBE4D9",
              borderRadius: 16,
              padding: 28,
            }}
          >
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>
              {network ? "Pas de connexion au serveur" : "Une erreur est survenue"}
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#4A443C", marginTop: 10 }}>
              {network
                ? "Vos saisies sont gardées sur cet appareil et partiront au retour du réseau. Réessayez dans un instant."
                : "La page n'a pas pu s'afficher. L'incident vient d'être signalé automatiquement à l'administrateur — vos données ne sont pas affectées."}
            </p>
            {error.digest && (
              <div
                style={{
                  fontSize: 12.5,
                  color: "#8A8278",
                  background: "#FBF9F4",
                  border: "1px solid #EBE4D9",
                  borderRadius: 8,
                  padding: "8px 12px",
                  marginTop: 14,
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                Référence : {error.digest}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                // `retry` fetches the page again; `reset` only re-rendered the
                // same broken state, so the button never helped.
                onClick={() => (network ? window.location.reload() : retry())}
                style={{
                  flex: 1,
                  height: 42,
                  borderRadius: 10,
                  border: "none",
                  background: "#0F7A3D",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Réessayer
              </button>
              <a
                href="/tableau-de-bord"
                style={{
                  flex: 1,
                  height: 42,
                  borderRadius: 10,
                  border: "1px solid #DFD8CC",
                  background: "#fff",
                  color: "#221E1A",
                  fontSize: 14,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textDecoration: "none",
                }}
              >
                Tableau de bord
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
