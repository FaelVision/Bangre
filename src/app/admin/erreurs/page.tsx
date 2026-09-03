import Link from "next/link";
import { verifyAdmin } from "@/lib/admin-dal";
import { getErrorLogs } from "@/lib/admin-queries";
import { formatDateTime } from "@/lib/format";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui";
import { ErrorRow } from "./error-row";

const FILTERS = [
  { key: "open", label: "À traiter" },
  { key: "resolved", label: "Résolues" },
  { key: "all", label: "Toutes" },
] as const;

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string }>;
}) {
  const admin = await verifyAdmin();
  const { etat } = await searchParams;
  const filter = (FILTERS.find((f) => f.key === etat)?.key ?? "open") as "open" | "resolved" | "all";
  const { errors, openCount, resolvedCount } = await getErrorLogs(filter);

  return (
    <AdminShell adminName={admin.name} current="erreurs" openErrors={openCount}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[21px] font-semibold tracking-tight">Erreurs du site</div>
          <div className="text-[13px] text-(--color-text-muted) mt-1 max-w-[60ch] leading-relaxed">
            Chaque plantage serveur ou navigateur est enregistré ici automatiquement, regroupé par cause et compté.
            Le code « Référence » affiché à l&apos;utilisateur correspond au champ digest.
          </div>
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "open" ? "/admin/erreurs" : `/admin/erreurs?etat=${f.key}`}
              className={`h-9 rounded-[9px] px-3.5 flex items-center text-[13px] font-medium no-underline hover:no-underline ${
                filter === f.key
                  ? "bg-[#221E1A] text-white"
                  : "border border-(--color-border-strong) bg-white text-(--color-text)"
              }`}
            >
              {f.label}
              {f.key === "open" && openCount > 0 ? ` · ${openCount}` : ""}
              {f.key === "resolved" && resolvedCount > 0 ? ` · ${resolvedCount}` : ""}
            </Link>
          ))}
        </div>
      </div>

      {errors.length === 0 ? (
        <Card className="mt-4 text-center py-12">
          <div className="text-[15px] font-semibold text-(--color-success-text)">
            {filter === "open" ? "Aucune erreur en attente" : "Aucune erreur dans cette vue"}
          </div>
          <div className="text-[13px] text-(--color-text-muted) mt-1.5">
            {filter === "open"
              ? "Le site n'a signalé aucun plantage non traité."
              : "Changez de filtre pour voir les autres entrées."}
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 mt-4">
          {errors.map((e) => (
            <ErrorRow
              key={e.id}
              id={e.id}
              message={e.message}
              stack={e.stack}
              digest={e.digest}
              route={e.route}
              path={e.path}
              method={e.method}
              source={e.source}
              kind={e.kind}
              count={e.count}
              schoolName={e.school?.name ?? null}
              firstSeen={formatDateTime(e.firstSeenAt)}
              lastSeen={formatDateTime(e.lastSeenAt)}
              resolved={e.resolvedAt !== null}
            />
          ))}
        </div>
      )}
    </AdminShell>
  );
}
