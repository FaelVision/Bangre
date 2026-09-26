import { prisma } from "@/lib/db";
import { getCurrentSchool, hasCurrentSubscription } from "@/lib/dal";
import Link from "next/link";
import { formatDate, formatDateTime, formatAmount } from "@/lib/format";
import { logoutAction } from "@/lib/actions/auth";
import { PLANS } from "@/lib/plans";
import { SubscriptionForm } from "./subscription-form";

export default async function AbonnementPage() {
  const school = await getCurrentSchool();
  const isActive = hasCurrentSubscription(school);
  // A renewal date on a school without access means a subscription that lapsed.
  const lapsed = !isActive && !!school.subscriptionRenewsAt;
  const pendingPayment = await prisma.subscriptionPayment.findFirst({
    where: { schoolId: school.id, status: "pending" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="text-[13px] font-semibold text-(--color-primary) tracking-wider uppercase">
        Étape 2 sur 2
      </div>
      <div className="text-[27px] font-semibold tracking-tight mt-2">Abonnement</div>

      <div className="border border-[#E7C9A8] bg-(--color-gold-bg) rounded-2xl p-4.5 mt-5.5 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[180px]">
          <span className="inline-block text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-(--color-gold-chip-bg) text-(--color-gold-text)">
            {isActive ? "Abonnement actif" : lapsed ? "Abonnement expiré" : "Abonnement requis"}
          </span>
          <div className="text-[15px] font-semibold mt-2.5">{school.name}</div>
          <div className="text-[13px] text-(--color-text-muted) mt-0.5">
            {isActive
              ? `Renouvellement le ${formatDate(school.subscriptionRenewsAt)}`
              : lapsed
                ? `Expiré le ${formatDate(school.subscriptionRenewsAt)} — renouvelez pour retrouver l'accès`
                : "Choisissez une formule pour accéder à Bangré"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[26px] font-bold tracking-tight tabular-nums whitespace-nowrap">
            {formatAmount(PLANS.monthly.amount)}
          </div>
          <div className="text-[12.5px] text-(--color-text-muted)">CFA / mois</div>
          <div className="text-[12.5px] text-(--color-text-muted) mt-1.5 whitespace-nowrap">
            ou <b className="text-(--color-text) tabular-nums">{formatAmount(PLANS.yearly.amount)}</b> / an
          </div>
        </div>
      </div>

      {pendingPayment && (
        <div className="border border-(--color-gold-border) bg-(--color-gold-bg) rounded-2xl p-4 mt-4">
          <div className="text-[13.5px] font-semibold">Paiement en attente de confirmation</div>
          <div className="text-[12.5px] text-(--color-text-muted) mt-1 leading-relaxed">
            {formatAmount(pendingPayment.amount)} CFA envoyé le {formatDateTime(pendingPayment.createdAt)} par{" "}
            {pendingPayment.provider === "orange_money" ? "Orange Money" : "Moov Money"}. Nous vérifions la réception
            et confirmons sous peu — l&apos;abonnement s&apos;active automatiquement dès la confirmation, sans action
            de votre part.
          </div>
        </div>
      )}

      {!isActive && (
        <>
          <SubscriptionForm defaultPhone={school.phone ?? ""} />
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-center w-full text-[13.5px] text-(--color-text-muted) font-semibold mt-4 cursor-pointer"
            >
              Se déconnecter
            </button>
          </form>
        </>
      )}

      {isActive && (
        <>
          <div className="text-[13px] text-(--color-text-muted) mt-5 leading-relaxed">
            Vous pouvez prolonger dès maintenant — les jours déjà payés sont conservés et la nouvelle période
            s&apos;ajoute à la date de renouvellement.
          </div>
          <SubscriptionForm defaultPhone={school.phone ?? ""} />
          <Link
            href="/tableau-de-bord"
            className="mt-4 h-[48px] w-full rounded-[10px] bg-(--color-primary) text-white font-semibold flex items-center justify-center no-underline hover:no-underline"
          >
            Aller au tableau de bord
          </Link>
        </>
      )}
    </div>
  );
}
