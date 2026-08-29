import { redirect } from "next/navigation";
import { decryptSession, getSessionCookie } from "@/lib/session";

export default async function RootPage() {
  const token = await getSessionCookie();
  const session = await decryptSession(token);
  redirect(session?.schoolId ? "/tableau-de-bord" : "/connexion");
}
