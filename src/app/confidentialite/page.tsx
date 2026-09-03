import Link from "next/link";

export const metadata = {
  title: "Confidentialité — Bangre",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      <div className="text-[13.5px] text-(--color-text-secondary) leading-relaxed mt-2 space-y-2.5">
        {children}
      </div>
    </section>
  );
}

/**
 * Politique de confidentialité publique de Bangre — requise pour publier le
 * client OAuth Google (connexion "Sign in with Google") en dehors du mode Test.
 * Pas d'authentification requise : accessible à tous, y compris à Google lors
 * de la vérification du client OAuth.
 */
export default function ConfidentialitePage() {
  return (
    <div className="min-h-screen bg-(--color-bg-page) flex justify-center px-5 py-12">
      <div className="w-full max-w-[680px]">
        <Link href="/" className="text-[13px] font-semibold text-(--color-primary) no-underline hover:underline">
          ← Bangre
        </Link>

        <h1 className="text-[26px] font-semibold tracking-tight mt-4">Politique de confidentialité</h1>
        <p className="text-[13px] text-(--color-text-secondary) mt-1.5">Dernière mise à jour : septembre 2026</p>

        <p className="text-[13.5px] text-(--color-text-secondary) leading-relaxed mt-5">
          Bangre est un logiciel de gestion de la scolarité destiné aux établissements scolaires (écoles, collèges,
          lycées) au Burkina Faso. Cette page explique quelles données sont collectées lors de l&apos;utilisation de
          Bangre, dans quel but, et comment elles sont protégées.
        </p>

        <Section title="Qui est responsable de vos données">
          <p>
            Bangre est édité par FasoLink. Pour toute question relative à cette politique ou à vos données, vous
            pouvez écrire à{" "}
            <a href="mailto:syameogo743@gmail.com" className="text-(--color-primary) underline">
              syameogo743@gmail.com
            </a>
            .
          </p>
        </Section>

        <Section title="Comptes établissement">
          <p>
            Chaque établissement dispose d&apos;un compte unique : nom de l&apos;établissement, ville, nom du
            contact, numéro de téléphone et, le cas échéant, adresse e-mail. Ces informations servent uniquement à
            identifier l&apos;établissement, à sécuriser la connexion et à le contacter au sujet de son abonnement.
          </p>
        </Section>

        <Section title="Connexion avec Google">
          <p>
            Bangre propose de se connecter avec un compte Google en plus de la connexion par numéro de téléphone.
            Lorsque vous choisissez cette option, Google nous transmet votre adresse e-mail, votre nom et votre
            photo de profil, uniquement afin de créer ou reconnaître votre compte établissement. Bangre ne demande
            aucun autre accès à votre compte Google (ni contacts, ni fichiers, ni agenda) et ne publie jamais rien
            en votre nom.
          </p>
        </Section>

        <Section title="Données des élèves et des paiements">
          <p>
            Pour permettre le suivi de la scolarité, un établissement peut enregistrer dans son propre compte : les
            classes, les élèves (nom, prénom, date de naissance, nom et numéro de téléphone d&apos;un parent), les
            tranches et paiements de scolarité, et les reçus correspondants.
          </p>
          <p>
            Ces données appartiennent à l&apos;établissement qui les saisit. Elles ne sont accessibles qu&apos;à ce
            compte et à l&apos;équipe technique de Bangre lorsque c&apos;est strictement nécessaire (support,
            maintenance).
          </p>
        </Section>

        <Section title="Rappels WhatsApp">
          <p>
            Lorsqu&apos;un établissement active les rappels automatiques, le numéro de téléphone du parent renseigné
            pour un élève est utilisé pour lui envoyer, via l&apos;API WhatsApp, un rappel d&apos;échéance de
            paiement ou une confirmation de règlement. Ce numéro n&apos;est utilisé à aucune autre fin.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            Bangre utilise un unique cookie technique, nécessaire au fonctionnement du service : il maintient la
            session de connexion de l&apos;utilisateur. Il n&apos;y a pas de cookie publicitaire ni de suivi à des
            fins commerciales.
          </p>
        </Section>

        <Section title="Conservation et sécurité">
          <p>
            Les données sont hébergées chez des prestataires d&apos;infrastructure (hébergement applicatif et base
            de données) situés hors du Burkina Faso, avec un accès restreint et chiffré. Elles sont conservées tant
            que le compte de l&apos;établissement est actif, et supprimées à sa demande.
          </p>
        </Section>

        <Section title="Vos droits">
          <p>
            Un établissement peut à tout moment demander l&apos;export ou la suppression des données de son compte
            en écrivant à l&apos;adresse ci-dessus. Une personne dont les coordonnées figurent dans Bangre en tant
            que parent d&apos;élève peut également demander leur rectification ou leur suppression auprès de
            l&apos;établissement concerné, qui est responsable de la saisie de ces informations.
          </p>
        </Section>
      </div>
    </div>
  );
}
