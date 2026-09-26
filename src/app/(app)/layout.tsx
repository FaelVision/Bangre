import { requireActiveSubscription, getCurrentAcademicYear, verifySession } from "@/lib/dal";
import { getSidebarCounts } from "@/lib/queries";
import { daysUntil, formatDate } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { PaymentModalProvider } from "@/components/payment-modal-context";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { OfflineSync } from "@/components/offline-status";
import { SubscriptionExpiryAlert } from "@/components/subscription-expiry-alert";

const EXPIRY_ALERT_THRESHOLD_DAYS = 7;

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

  // Only a paid subscription opens the app, so its renewal date is the one
  // worth warning about.
  const expiryDate = school.subscriptionRenewsAt;
  const daysLeft = expiryDate ? daysUntil(expiryDate) : null;

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
        <OfflineSync />
      </AppShell>
      {daysLeft !== null && daysLeft <= EXPIRY_ALERT_THRESHOLD_DAYS && (
        <SubscriptionExpiryAlert daysLeft={daysLeft} untilLabel={formatDate(expiryDate)} />
      )}
    </PaymentModalProvider>
  );
}
