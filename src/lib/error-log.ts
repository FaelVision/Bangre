import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

export type ErrorReport = {
  message: string;
  stack?: string;
  digest?: string;
  route?: string;
  path?: string;
  method?: string;
  source?: "server" | "client";
  kind?: string;
  schoolId?: string;
};

/**
 * Errors are grouped by a fingerprint (message + route) so a crash that fires
 * on every page load shows up as one line with a count, instead of flooding
 * the admin list. A recurrence re-opens an entry that was marked resolved.
 */
function fingerprintOf(report: ErrorReport) {
  const normalised = report.message
    .replace(/\b[0-9a-f]{8,}\b/gi, "<id>") // cuids, hashes, digests
    .replace(/\d+/g, "<n>")
    .slice(0, 400);
  return createHash("sha1").update(`${report.source ?? "server"}|${report.route ?? ""}|${normalised}`).digest("hex");
}

export async function recordError(report: ErrorReport) {
  const fingerprint = fingerprintOf(report);
  const now = new Date();

  try {
    await prisma.errorLog.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        message: report.message.slice(0, 2000),
        stack: report.stack?.slice(0, 8000),
        digest: report.digest,
        route: report.route,
        path: report.path,
        method: report.method,
        source: report.source ?? "server",
        kind: report.kind,
        schoolId: report.schoolId,
      },
      update: {
        count: { increment: 1 },
        lastSeenAt: now,
        // A crash that comes back was not actually fixed.
        resolvedAt: null,
        message: report.message.slice(0, 2000),
        stack: report.stack?.slice(0, 8000),
        digest: report.digest,
        path: report.path,
      },
    });
  } catch (err) {
    // Never let the error reporter become the error.
    console.error("[error-log] impossible d'enregistrer l'erreur :", err);
  }
}
