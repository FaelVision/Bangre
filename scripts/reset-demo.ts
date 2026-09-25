/*
 * Creates (or rebuilds) the demonstration school on whichever database
 * DATABASE_URL points at.
 *
 *   npm run demo:reset
 *
 * Only the account holding the demo e-mail is replaced — every other school is
 * left alone, unlike `npm run db:seed`, which empties the database. In
 * production, prefer the "Réinitialiser la démo" button in /admin: it runs the
 * very same code against the real database without needing its credentials.
 */
import { resetDemoSchool, DEMO_SCHOOL_NAME } from "../src/lib/demo-school";
import { prisma } from "../src/lib/db";

async function main() {
  console.log(`Préparation de la démonstration « ${DEMO_SCHOOL_NAME} »…`);
  const result = await resetDemoSchool();

  console.log(`
Compte de démonstration prêt :

  Établissement  ${DEMO_SCHOOL_NAME}
  E-mail         ${result.email}
  Téléphone      ${result.phone}
  Mot de passe   ${result.password}

  ${result.classes} classes · ${result.students} élèves · ${result.payments} reçus
`);
}

main()
  .catch((err) => {
    console.error("Échec :", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
