import { getCurrentSchool } from "@/lib/dal";
import { formatDate, daysUntil } from "@/lib/format";
import { continueTrialAction } from "@/lib/actions/subscription";
import { SubscriptionForm } from "./subscription-form";

export default async function AbonnementPage() {
  const school = await getCurrentSchool();
  const isActive = school.subscriptionStatus === "active";
  const daysLeft = school.trialEndsAt ? daysUntil(school.trialEndsAt) : 0;

  return (
    <div>
      <div className="text-[13px] font-semibold text-(--color-primary) tracking-wider uppercase">
        Étape 2 sur 2
      </div>
      <div className="text-[27px] font-semibold tracking-tight mt-2">Abonnement</div>

      <div className="border border-[#E7C9A8] bg-(--color-gold-bg) rounded-2xl p-4.5 mt-5.5 flex items-center gap-4">
        <div className="flex-1">
          <span className="inline-block text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-(--color-gold-chip-bg) text-(--color-gold-text)">
            {isActive ? "Abonnement actif" : `Essai — ${daysLeft} jour${daysLeft > 1 ? "s" : ""} restants`}
          </span>
          <div className="text-[15px] font-semibold mt-2.5">{school.name}</div>
          <div className="text-[13px] text-(--color-text-muted) mt-0.5">
            {isActive
              ? `Renouvellement le ${formatDate(school.subscriptionRenewsAt)}`
              : `Fin d'essai le ${formatDate(school.trialEndsAt)}`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[26px] font-bold tracking-tight tabular-nums">5 000</div>
          <div className="text-[12.5px] text-(--color-text-muted)">CFA / mois</div>
        </div>
      </div>

      {!isActive && (
        <>
          <SubscriptionForm defaultPhone={school.phone} />
          <form action={continueTrialAction}>
            <button
              type="submit"
              className="text-center w-full text-[13.5px] text-(--color-primary) font-semibold mt-4 cursor-pointer"
            >
              Continuer l&apos;essai sans payer
            </button>
          </form>
        </>
      )}

      {isActive && (
        <form action={continueTrialAction} className="mt-6">
          <button
            type="submit"
            className="h-[48px] w-full rounded-[10px] bg-(--color-primary) text-white font-semibold cursor-pointer"
          >
            Aller au tableau de bord
          </button>
        </form>
      )}
    </div>
  );
}
