import type { Instrumentation } from "next";

/**
 * Every server-side crash is written to the ErrorLog table so the platform
 * administrator sees it in /admin/erreurs instead of it living only in a
 * terminal nobody is watching.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // The Edge runtime has no node:crypto / Prisma; only report from Node.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { recordError } = await import("@/lib/error-log");

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;

  await recordError({
    message,
    stack,
    digest,
    route: context.routePath,
    path: request.path,
    method: request.method,
    kind: context.routeType,
    source: "server",
  });
};
