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
