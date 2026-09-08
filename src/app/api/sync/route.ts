import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decryptSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { persistPayment, type RecordPaymentInput } from "@/lib/payments-core";
import { createStudent, updateStudent, type StudentInput } from "@/lib/students-core";

type Body =
  | { kind: "payment"; payload: RecordPaymentInput }
  | { kind: "student.create"; payload: StudentInput }
  | { kind: "student.update"; studentId: string; payload: StudentInput };

/**
 * Replays one operation captured while the browser was offline.
 *
 * `permanent: true` tells the client the entry will never succeed (bad data,
 * deleted record) so it can be dropped instead of blocking the queue.
 */
export async function POST(req: NextRequest) {
  const session = await decryptSession(req.cookies.get("bangre_session")?.value);
  if (!session?.schoolId) {
    return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });
  }

  const school = await prisma.school.findUnique({
    where: { id: session.schoolId },
    select: { blocked: true },
  });
  if (!school) return NextResponse.json({ ok: false, error: "Compte introuvable." }, { status: 401 });
  if (school.blocked) {
    return NextResponse.json({ ok: false, error: "Compte suspendu." }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Requête illisible.", permanent: true }, { status: 400 });
  }

  try {
    switch (body.kind) {
      case "payment": {
        const result = await persistPayment(session.schoolId, { ...body.payload, offlineCreated: true });
        if (result.ok) return NextResponse.json(result);
        return NextResponse.json({ ok: false, error: result.error, permanent: true }, { status: 400 });
      }

      case "student.create": {
        const result = await createStudent(session.schoolId, body.payload);
        if (result.ok) return NextResponse.json(result);
        return NextResponse.json({ ok: false, error: result.error, permanent: true }, { status: 400 });
      }

      case "student.update": {
        const result = await updateStudent(session.schoolId, body.studentId, body.payload);
        if (result.ok) return NextResponse.json(result);
        return NextResponse.json({ ok: false, error: result.error, permanent: true }, { status: 400 });
      }

      default:
        return NextResponse.json({ ok: false, error: "Opération inconnue.", permanent: true }, { status: 400 });
    }
  } catch (err) {
    // Unexpected failure: not permanent, the client should retry later.
    console.error("[sync] échec :", err);
    return NextResponse.json({ ok: false, error: "Erreur serveur pendant la synchronisation." }, { status: 500 });
  }
}
