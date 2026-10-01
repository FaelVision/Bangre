import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ServiceOptionCard } from "@/components/canteen/service-option-card";

/**
 * Options de l'établissement: the services beside tuition a school may run.
 * Only the ones turned on take a place in the menu.
 */
export default async function OptionsPage() {
  const { schoolId } = await verifySession();
  const school = await prisma.school.findUniqueOrThrow({
    where: { id: schoolId },
    select: { canteenEnabled: true, daycareEnabled: true, uniformsEnabled: true },
  });

  return (
    <div>
      <PageHeader
        title="Options de l'établissement"
        subtitle="Activez seulement ce que votre établissement propose : chaque option ajoute son onglet au menu."
      />
      <div className="p-4 lg:p-7 grid gap-3.5 max-w-[680px]">
        <ServiceOptionCard
          service="canteen"
          enabled={school.canteenEnabled}
          description="Les élèves inscrits à la cantine la paient à part de la scolarité : au mois, en forfaits (trimestres…) ou à l'année. Reçus, retards et rappels WhatsApp compris."
        />
        <ServiceOptionCard
          service="daycare"
          enabled={school.daycareEnabled}
          description="Pour les enfants gardés par l'école (avant ou après la classe, le midi…). Réservée aux élèves de maternelle et du primaire, payée de la même façon que la cantine."
        />
        <ServiceOptionCard
          service="uniforms"
          enabled={school.uniformsEnabled}
          description="Vendez vos tenues (scolaire, sport…) avec reçu : vous fixez les tenues, les niveaux concernés, les tailles, les prix et, si vous le voulez, le stock. Paiement en une fois et suivi des tenues à remettre."
        />
        <p className="text-[12.5px] text-(--color-text-muted) leading-relaxed">
          Désactiver une option la retire du menu ; les inscriptions et paiements déjà enregistrés sont conservés et
          réapparaissent si vous la réactivez.
        </p>
      </div>
    </div>
  );
}
