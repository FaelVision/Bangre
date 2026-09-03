/*
 * Creates (or resets) a platform administrator.
 *
 *   npm run admin:create -- "+226 70 00 00 00" "Votre nom"
 *
 * The password is generated here and printed once — it is never stored in
 * plain text, never committed, and never sent anywhere.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../src/lib/validation";

const prisma = new PrismaClient();

function generatePassword() {
  // Ambiguous characters removed so the password can be read aloud or retyped.
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function main() {
  const [phoneRaw, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(" ").trim();

  if (!phoneRaw || !name) {
    console.error('Usage : npm run admin:create -- "+226 70 00 00 00" "Votre nom"');
    process.exitCode = 1;
    return;
  }

  const phone = normalizePhone(phoneRaw);
  if (!/^\+226\d{8}$/.test(phone)) {
    console.error(`Numéro invalide : ${phoneRaw} (attendu : 8 chiffres après +226)`);
    process.exitCode = 1;
    return;
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.admin.findUnique({ where: { phone } });
  const admin = existing
    ? await prisma.admin.update({ where: { phone }, data: { name, passwordHash } })
    : await prisma.admin.create({ data: { name, phone, passwordHash } });

  console.log(`
${existing ? "Mot de passe réinitialisé" : "Administrateur créé"} :

  Nom       ${admin.name}
  Téléphone ${admin.phone}
  Mot de passe  ${password}

Notez-le maintenant : il ne sera plus affiché.
Connexion : http://localhost:3000/admin/connexion
`);
}

main()
  .catch((err) => {
    console.error("Échec :", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
