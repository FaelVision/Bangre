import { requireActiveSubscription, getCurrentAcademicYear, verifySession, hasCurrentSubscription } from "@/lib/dal";
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

  // Whichever date currently governs access — the trial end date, or the paid
  // renewal date once a subscription is active — is the one worth warning about.
  const isActive = hasCurrentSubscription(school);
  const expiryDate = isActive ? school.subscriptionRenewsAt : school.trialEndsAt;
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
        <SubscriptionExpiryAlert daysLeft={daysLeft} isTrial={!isActive} untilLabel={formatDate(expiryDate)} />
      )}
    </PaymentModalProvider>
  );
}
