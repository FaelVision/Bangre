import "server-only";

export { buildWhatsAppLink } from "@/lib/whatsapp-link";

export function fillReminderTemplate(
  template: string,
  vars: {
    parent: string;
    tranche: string;
    eleve: string;
    classe: string;
    montant: string;
    echeance: string;
    ecole: string;
  }
) {
  return template
    .replaceAll("{parent}", vars.parent)
    .replaceAll("{tranche}", vars.tranche)
    .replaceAll("{eleve}", vars.eleve)
    .replaceAll("{classe}", vars.classe)
    .replaceAll("{montant}", vars.montant)
    .replaceAll("{echeance}", vars.echeance)
    .replaceAll("{ecole}", vars.ecole);
}

export const DEFAULT_REMINDER_TEMPLATE =
  "Bonjour {parent}, la {tranche} de la scolarité de {eleve} ({classe}), d'un montant de {montant} CFA, est attendue le {echeance}. Merci. — {ecole}";
