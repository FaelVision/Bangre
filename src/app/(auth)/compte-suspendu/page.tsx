import { getCurrentSchool } from "@/lib/dal";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/format";
import { logoutAction } from "@/lib/actions/auth";

export default async function SuspendedAccountPage() {
  const school = await getCurrentSchool();
  // Nothing to show once the administrator has lifted the suspension.
  if (!school.blocked) redirect("/tableau-de-bord");

  return (
    <div>
      <div className="text-[13px] font-semibold text-(--color-danger-text) tracking-wider uppercase">
        Compte suspendu
      </div>
      <div className="text-[27px] font-semibold tracking-tight mt-2">{school.name}</div>

      <div className="border border-(--color-danger-border) bg-(--color-danger-bg-soft) rounded-2xl p-4.5 mt-5.5">
        <div className="text-[14.5px] font-semibold">L&apos;accès à la plateforme est temporairement suspendu</div>
        <div className="text-[13.5px] text-(--color-text-secondary) mt-2 leading-relaxed">
          {school.blockedReason
            ? `Motif indiqué par l'administrateur : ${school.blockedReason}`
            : "Aucun motif n'a été précisé par l'administrateur."}
        </div>
        {school.blockedAt && (
          <div className="text-[12.5px] text-(--color-text-muted) mt-2">
            Suspension effective depuis le {formatDate(school.blockedAt)}.
          </div>
        )}
      </div>

      <div className="text-[13.5px] text-(--color-text-secondary) mt-5 leading-relaxed">
        Vos données — classes, élèves, paiements et reçus — sont intégralement conservées et seront de nouveau
        accessibles dès la levée de la suspension. Contactez l&apos;administrateur de Bangre pour régulariser la
        situation.
      </div>

      <form action={logoutAction} className="mt-6">
        <button
          type="submit"
          className="h-[46px] w-full rounded-[10px] border border-(--color-border-strong) bg-white text-[14.5px] font-semibold cursor-pointer"
        >
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
