import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { recordError } from "@/lib/error-log";
import { decryptSession } from "@/lib/session";

/**
 * Receives crashes from the browser (global-error.tsx). Open by necessity —
 * the page is broken when it calls this — so the payload is strictly capped
 * and same-origin only. Grouping by fingerprint keeps the table small.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  let body: { message?: unknown; stack?: unknown; digest?: unknown; path?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.slice(0, 1000) : "";
  if (!message) return NextResponse.json({ ok: false }, { status: 400 });

  const session = await decryptSession(req.cookies.get("bangre_session")?.value);

  await recordError({
    message,
    stack: typeof body.stack === "string" ? body.stack.slice(0, 4000) : undefined,
    digest: typeof body.digest === "string" ? body.digest.slice(0, 100) : undefined,
    path: typeof body.path === "string" ? body.path.slice(0, 300) : undefined,
    route: typeof body.path === "string" ? body.path.slice(0, 300) : undefined,
    source: "client",
    schoolId: session?.schoolId,
  });

  return NextResponse.json({ ok: true });
}
