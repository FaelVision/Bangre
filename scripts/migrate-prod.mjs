/*
 * Brings the production database up to the Prisma schema, before `next build`.
 *
 * The production DATABASE_URL is a Sensitive variable on Vercel: nobody can
 * read it back, so the schema cannot be pushed from a laptop. Vercel can: this
 * runs during its build, with its own DATABASE_URL.
 *
 * - Production builds only (VERCEL_ENV=production, a postgres URL). Local
 *   builds and preview deployments skip it.
 * - `prisma db push` WITHOUT --accept-data-loss: additions only (new tables,
 *   new columns with defaults). A change that would drop data makes it fail —
 *   and a failed build leaves the live site as it was.
 * - Neon's pooled endpoint ("-pooler") is not meant for schema changes: the
 *   direct endpoint of the same database is used instead.
 */
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";

if (process.env.VERCEL_ENV !== "production") {
  console.log("[migrate-prod] Not a production build: database left untouched.");
  process.exit(0);
}
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error("[migrate-prod] DATABASE_URL is not a postgres URL: refusing to build without an up-to-date schema.");
  process.exit(1);
}

const direct = url.replace(/(@[^/.]+)-pooler\./, "$1.");
console.log(
  `[migrate-prod] Applying the Prisma schema to the production database${direct !== url ? " (direct endpoint)" : ""}…`
);

const result = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: direct },
});

if (result.status !== 0) {
  console.error("[migrate-prod] Schema update failed: build stopped, the live site is unchanged.");
  process.exit(result.status ?? 1);
}
console.log("[migrate-prod] Production database is up to date.");
