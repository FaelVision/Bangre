import { isGoogleConfigured } from "@/lib/google";
import { LoginForm } from "./login-form";

const GOOGLE_NOTICES: Record<string, string> = {
  non_configure: "La connexion Google n'est pas encore configurée sur ce serveur.",
  annule: "Connexion Google annulée.",
  etat_invalide: "La session Google a expiré. Réessayez.",
  echec: "La connexion Google a échoué. Réessayez ou utilisez votre numéro.",
  email_non_verifie: "Cette adresse Google n'est pas vérifiée.",
};

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const { google } = await searchParams;

  return <LoginForm googleEnabled={isGoogleConfigured()} googleNotice={google ? GOOGLE_NOTICES[google] : undefined} />;
}
