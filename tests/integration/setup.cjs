/*
 * Integration-test bootstrap (loaded via `node --require` before any ESM):
 * copy the demo DB to a throwaway file and point Prisma at that copy, so
 * `npm run test:integ` never mutates prisma/dev.db.
 */
const fs = require("node:fs");
const path = require("node:path");

const src = path.join(__dirname, "..", "..", "prisma", "dev.db");
const dst = path.join(__dirname, "..", "..", "prisma", "test-integ.db");
fs.copyFileSync(src, dst);

process.env.DATABASE_URL = "file:./test-integ.db";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

// Integration tests assert on the mock-mode code path for email (the sender
// is only ever a wa.me link for WhatsApp — nothing to fake there) and must
// never depend on network access to a real provider. Blank out any live
// credentials .env may carry so email sends always fall back to mock,
// regardless of what's configured for `npm run dev`. Set to "" rather than
// deleted: PrismaClient re-loads .env (non-overriding) the first time it's
// instantiated, which would otherwise silently restore a deleted key from
// the real .env file.
process.env.BREVO_API_KEY = "";
process.env.RESEND_API_KEY = "";
