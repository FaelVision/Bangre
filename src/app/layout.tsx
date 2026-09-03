import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

// Self-hosted (next/font downloads at build time) so text renders correctly
// with no network — the app is used offline on the school's local wifi.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bangre — Gestion de la scolarité",
  description: "Bangre : classes, tranches de paiement, reçus et rappels WhatsApp pour les établissements scolaires.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FBF7F0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${instrumentSans.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
