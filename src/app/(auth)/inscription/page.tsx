import { isGoogleConfigured } from "@/lib/google";
import { readPendingGoogleLink } from "@/lib/session";
import { SignupForm } from "./signup-form";

export default async function InscriptionPage() {
  const link = await readPendingGoogleLink();

  return (
    <SignupForm
      googleEnabled={isGoogleConfigured()}
      googleLink={link ? { email: link.email, name: link.name } : null}
    />
  );
}
