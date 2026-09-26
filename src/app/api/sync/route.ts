import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decryptSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { persistPayment, type RecordPaymentInput } from "@/lib/payments-core";
import { createStudent, updateStudent, type StudentInput } from "@/lib/students-core";
import { recordReminderSent } from "@/lib/reminders-core";
import { normalizePhone } from "@/lib/phone";

/** Every entry of the device outbox carries these, whatever its kind. */
type Envelope = { id?: string; schoolId?: string };

type Body = Envelope &
  (
    | { kind: "payment"; payload: RecordPaymentInput }
    | { kind: "student.create"; payload: StudentInput }
    | { kind: "student.update"; studentId: string; payload: StudentInput }
    | { kind: "reminder.send"; studentId: string; trancheId: string | null; message: string }
  );

/** A replay of this entry within that window is the same entry sent twice, not a new one. */
const REPLAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Replays one operation captured while the browser was offline.
 *
 * `permanent: true` tells the client the entry will never succeed (bad data,
 * deleted record) so it can be set aside instead of blocking the queue.
 *
 * Every kind is safe to receive twice: on a weak connection the server can
 * apply an entry and the answer never reach the device, which then sends it
 * again. The second copy is recognised and answered like the first.
 */
export async function POST(req: NextRequest) {
  const session = await decryptSession(req.cookies.get("bangre_session")?.value);
  if (!session?.schoolId) {
    return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });
  }
  const schoolId = session.schoolId;

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
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

  // Typed on this device for another school that was signed in earlier: it
  // belongs to that account and waits for it.
  if (body.schoolId && body.schoolId !== schoolId) {
    return NextResponse.json(
      { ok: false, otherSchool: true, error: "Saisi pour un autre établissement." },
      { status: 409 }
    );
  }

  try {
    switch (body.kind) {
      case "payment": {
        const result = await persistPayment(schoolId, {
          ...body.payload,
          offlineCreated: true,
          clientRef: body.id ? `sync:${body.id}` : undefined,
        });
        if (result.ok) return NextResponse.json(result);
        return NextResponse.json({ ok: false, error: result.error, permanent: true }, { status: 400 });
      }

      case "student.create": {
        const already = await findReplayedStudent(schoolId, body.payload);
        if (already) return NextResponse.json({ ok: true, studentId: already.id, matricule: already.matricule });

        let result = await createStudent(schoolId, body.payload);
        // The matricule suggested on the device was the next free one *there*;
        // another computer may have used it meanwhile. The student typed at
        // the counter matters more than that number: take the next free one.
        if (!result.ok && body.payload.matricule && /matricule/i.test(result.error)) {
          result = await createStudent(schoolId, { ...body.payload, matricule: "" });
        }
        if (result.ok) return NextResponse.json(result);
        return NextResponse.json({ ok: false, error: result.error, permanent: true }, { status: 400 });
      }

      case "student.update": {
        const result = await updateStudent(schoolId, body.studentId, body.payload);
        if (result.ok) return NextResponse.json(result);
        return NextResponse.json({ ok: false, error: result.error, permanent: true }, { status: 400 });
      }

      case "reminder.send": {
        // The message was already opened in WhatsApp on the device; this only
        // records that it went out, so the student file and the retards list
        // stop showing "aucun rappel".
        const student = await prisma.student.findFirst({
          where: { id: body.studentId, schoolId },
          select: { id: true },
        });
        if (!student) {
          return NextResponse.json({ ok: false, error: "Élève introuvable.", permanent: true }, { status: 400 });
        }
        const replayed = await prisma.reminder.findFirst({
          where: {
            schoolId,
            studentId: body.studentId,
            message: body.message,
            sentAt: { gte: new Date(Date.now() - REPLAY_WINDOW_MS) },
          },
          select: { id: true },
        });
        if (replayed) return NextResponse.json({ ok: true, reminderId: replayed.id });
        return NextResponse.json(await recordReminderSent(schoolId, body.studentId, body.trancheId, body.message));
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

/**
 * The same student, created by an earlier copy of this entry: same class, same
 * names, same parent number, created recently.
 */
async function findReplayedStudent(schoolId: string, input: StudentInput) {
  const lastName = input.lastName?.trim().toUpperCase();
  const firstName = input.firstName?.trim();
  if (!input.classId || !lastName || !firstName) return null;
  const phone = input.parentPhone?.trim();

  return prisma.student.findFirst({
    where: {
      schoolId,
      classId: input.classId,
      lastName,
      firstName,
      parentPhone: phone ? normalizePhone(phone) : null,
      createdAt: { gte: new Date(Date.now() - REPLAY_WINDOW_MS) },
    },
    select: { id: true, matricule: true },
  });
}
