/*
 * prisma/schema.prisma has a single, static `datasource.provider`. Production
 * (Vercel + Neon) needs "postgresql"; local dev still uses the SQLite file at
 * prisma/dev.db (zero setup, already seeded). Rather than requiring everyone
 * to run Postgres locally, this script rewrites the provider line to match
 * DATABASE_URL's scheme before `prisma generate` runs — postgresql:// or
 * postgres:// => "postgresql", file: => "sqlite". It never touches the URL
 * itself, and prisma/schema.prisma stays committed as "postgresql" (the
 * deployed value); the local rewrite is a working-tree-only side effect.
 *
 * Wired into `predev` and `postinstall` so this is automatic — nobody needs
 * to remember to flip the schema by hand.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(root, ".env");
if (existsSync(envPath)) config({ path: envPath });
// .env.local overrides .env, same precedence Next.js uses.
const envLocalPath = path.join(root, ".env.local");
if (existsSync(envLocalPath)) config({ path: envLocalPath, override: true });

const databaseUrl = process.env.DATABASE_URL ?? "";
let provider;
if (databaseUrl.startsWith("file:")) {
  provider = "sqlite";
} else if (databaseUrl.startsWith("postgresql:") || databaseUrl.startsWith("postgres:")) {
  provider = "postgresql";
} else {
  console.warn(
    `[sync-prisma-provider] DATABASE_URL is unset or unrecognized (${JSON.stringify(databaseUrl)}) — leaving prisma/schema.prisma untouched.`
  );
  process.exit(0);
}

const schemaPath = path.join(root, "prisma", "schema.prisma");
const schema = readFileSync(schemaPath, "utf8");
const updated = schema.replace(/(datasource db \{\s*\n\s*provider = )"[^"]+"/, `$1"${provider}"`);

if (updated !== schema) {
  writeFileSync(schemaPath, updated);
  console.log(`[sync-prisma-provider] prisma/schema.prisma provider set to "${provider}".`);
} else {
  console.log(`[sync-prisma-provider] provider already "${provider}", nothing to do.`);
}
