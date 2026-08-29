import { NextRequest, NextResponse } from "next/server";
import { decryptSession } from "@/lib/session";
import { persistPayment, type RecordPaymentInput } from "@/lib/payments-core";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("bangre_session")?.value;
  const session = await decryptSession(token);
  if (!session?.schoolId) {
    return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });
  }

  const body = (await req.json()) as RecordPaymentInput;
  const result = await persistPayment(session.schoolId, { ...body, offlineCreated: true });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
