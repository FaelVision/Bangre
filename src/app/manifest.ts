import type { MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest (already whitelisted in `src/proxy.ts` and
 * `public/sw.js`). Makes Bangre installable so the counter runs it as a
 * standalone app — it is used from phones on the school's own wifi, often with
 * a patchy connection.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bangre — Gestion de la scolarité",
    short_name: "Bangre",
    description:
      "Classes, tranches de paiement, reçus et rappels WhatsApp pour les établissements scolaires.",
    lang: "fr",
    start_url: "/tableau-de-bord",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FBF7F0",
    theme_color: "#FBF7F0",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
