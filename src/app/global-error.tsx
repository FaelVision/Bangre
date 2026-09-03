"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Report to the admin error log. Fire-and-forget: the page is already
    // broken, a failed report must not make it worse.
    fetch("/api/errors/client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message || "Erreur inconnue",
        stack: error.stack,
        digest: error.digest,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

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
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>Une erreur est survenue</div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#4A443C", marginTop: 10 }}>
              La page n&apos;a pas pu s&apos;afficher. L&apos;incident vient d&apos;être signalé automatiquement à
              l&apos;administrateur — vos données ne sont pas affectées.
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
                onClick={reset}
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
