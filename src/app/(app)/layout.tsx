import { requireActiveSubscription, getCurrentAcademicYear, verifySession } from "@/lib/dal";
import { getSidebarCounts } from "@/lib/queries";
import { Sidebar } from "@/components/sidebar";
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
      <div className="w-full flex min-h-screen bg-(--color-bg-app)">
        <Sidebar
          schoolName={school.name}
          academicYearLabel={year?.label ?? ""}
          contactInitials={initials}
          contactName={school.contactName}
          counts={counts}
        />
        <div className="flex-1 min-w-0">{children}</div>
        <ServiceWorkerRegister />
      </div>
    </PaymentModalProvider>
  );
}
