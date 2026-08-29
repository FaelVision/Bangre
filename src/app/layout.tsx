import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bangre — Gestion de la scolarité",
  description: "Bangre : classes, tranches de paiement, reçus et rappels WhatsApp pour les établissements scolaires.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- this rule targets the Pages Router's _document.js; the root layout is the App Router's correct place for a shared font <link>. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
