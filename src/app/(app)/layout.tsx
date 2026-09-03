import { requireActiveSubscription, getCurrentAcademicYear, verifySession } from "@/lib/dal";
import { getSidebarCounts } from "@/lib/queries";
import { AppShell } from "@/components/app-shell";
import { PaymentModalProvider } from "@/components/payment-modal-context";
import { ServiceWorkerRegister } from "@/components/sw-register";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { schoolId } = await verifySession();
  const school = await requireActiveSubscription();
  const year = await getCurrentAcademicYear();
  const counts = await getSidebarCounts(schoolId);

  const initials = school.contactName
    .split(" ")
    .map((p) => p.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <PaymentModalProvider>
      <AppShell
        schoolName={school.name}
        academicYearLabel={year?.label ?? ""}
        contactInitials={initials}
        contactName={school.contactName}
        counts={counts}
      >
        {children}
        <ServiceWorkerRegister />
      </AppShell>
    </PaymentModalProvider>
  );
}
