import type { MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest (already whitelisted in `src/proxy.ts` and
 * `public/sw.js`). Makes Bangré installable — on the school's computer as on a
 * phone — as a standalone app that opens from its own icon, with or without a
 * network: the service worker serves the offline application and the school's
 * data is on the device.
 *
 * Chrome and Edge only offer installation with raster icons of 192 and 512 px
 * (`public/icon-*.png`, cut from the emblem of `public/logo-bangre.jpg`); the
 * maskable one pads the emblem into the safe zone the platform may round off.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bangré — Gestion de la scolarité",
    short_name: "Bangré",
    description:
      "Classes, tranches de paiement, reçus et rappels WhatsApp pour les établissements scolaires.",
    id: "/",
    lang: "fr",
    start_url: "/tableau-de-bord",
    scope: "/",
    display: "standalone",
    background_color: "#FBF7F0",
    theme_color: "#FBF7F0",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
