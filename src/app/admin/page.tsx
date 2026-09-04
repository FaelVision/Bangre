import Link from "next/link";
import { verifyAdmin } from "@/lib/admin-dal";
import { getAdminOverview, type SchoolRow } from "@/lib/admin-queries";
import { formatAmount, formatDate } from "@/lib/format";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui";
import { StateBadge } from "./state-badge";

const FILTERS = [
  { key: "", label: "Tous" },
  { key: "active", label: "Abonnés" },
  { key: "trial", label: "En essai" },
  { key: "expired", label: "Expirés" },
  { key: "blocked", label: "Bloqués" },
] as const;

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string; q?: string }>;
}) {
  const admin = await verifyAdmin();
  const { etat, q } = await searchParams;
  const { rows, stats } = await getAdminOverview();

  const filtered = rows.filter((r) => {
    if (etat && r.state !== etat) return false;
    if (q) {
      const needle = q.toLowerCase();
      return `${r.name} ${r.contactName} ${r.phone ?? ""} ${r.email ?? ""} ${r.city ?? ""}`.toLowerCase().includes(needle);
    }
    return true;
  });

  return (
    <AdminShell adminName={admin.name} current="ecoles" openErrors={stats.openErrors}>
      <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-4">
        <Stat label="Établissements" value={String(stats.total)} hint={`${stats.students} élèves au total`} />
        <Stat
          label="Abonnements actifs"
          value={String(stats.active)}
          hint={`≈ ${formatAmount(stats.mrr)} CFA / mois`}
          tone="success"
        />
        <Stat
          label="En période d'essai"
          value={String(stats.trial)}
          hint={stats.endingSoon > 0 ? `${stats.endingSoon} se termine(nt) sous 7 j` : "aucune échéance proche"}
          tone={stats.endingSoon > 0 ? "gold" : undefined}
        />
        <Stat
          label="Expirés ou bloqués"
          value={String(stats.expired + stats.blocked)}
          hint={`${stats.blocked} bloqué(s) par vous`}
          tone={stats.expired + stats.blocked > 0 ? "danger" : undefined}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <form action="/admin" className="flex-1 min-w-[200px]">
          {etat && <input type="hidden" name="etat" value={etat} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Rechercher un établissement, un responsable, un numéro…"
            className="w-full h-10 border border-(--color-border-strong) rounded-[10px] bg-white px-3.5 text-[13.5px] placeholder:text-(--color-text-placeholder) focus:outline-none focus:border-(--color-primary)"
          />
        </form>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => {
            const active = (etat ?? "") === f.key;
            const href = f.key
              ? `/admin?etat=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`
              : q
                ? `/admin?q=${encodeURIComponent(q)}`
                : "/admin";
            return (
              <Link
                key={f.label}
                href={href}
                className={`h-10 rounded-[10px] px-3.5 flex items-center text-[13px] font-medium no-underline hover:no-underline ${
                  active
                    ? "bg-[#221E1A] text-white"
                    : "border border-(--color-border-strong) bg-white text-(--color-text)"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-3.5 bg-white border border-(--color-border) rounded-2xl overflow-x-auto">
        <table className="w-full" style={{ minWidth: 900 }}>
          <thead>
            <tr className="bg-(--color-bg-subtle)">
              <Th>Établissement</Th>
              <Th>Responsable</Th>
              <Th>Abonnement</Th>
              <Th>Échéance</Th>
              <Th align="right">Élèves</Th>
              <Th align="right">Encaissé (abo.)</Th>
              <Th align="right">Inscrit le</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <SchoolLine key={r.id} row={r} zebra={i % 2 === 1} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-(--color-text-muted) py-10 text-sm">
                  Aucun établissement ne correspond.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-[12.5px] text-(--color-text-muted) mt-3">
        {filtered.length} établissement(s) affiché(s) sur {rows.length}. Cliquez une ligne pour gérer le compte.
      </div>
    </AdminShell>
  );
}

function SchoolLine({ row, zebra }: { row: SchoolRow; zebra: boolean }) {
  const deadline =
    row.state === "active" ? row.renewsAt : row.state === "trial" || row.state === "expired" ? row.trialEndsAt : null;

  return (
    <tr className="border-t border-(--color-border-row)" style={{ background: zebra ? "var(--color-bg-zebra)" : undefined }}>
      <Td>
        <Link href={`/admin/ecoles/${row.id}`} className="font-semibold text-(--color-text) no-underline hover:underline">
          {row.name}
        </Link>
        <div className="text-[12px] text-(--color-text-muted)">
          {[row.city, row.type].filter(Boolean).join(" · ") || "—"}
        </div>
      </Td>
      <Td>
        <div className="text-[13.5px]">{row.contactName}</div>
        <div className="text-[12px] text-(--color-text-muted) tabular-nums">{row.phone ?? row.email ?? "—"}</div>
      </Td>
      <Td>
        <StateBadge state={row.state} />
        {row.blocked && row.blockedReason && (
          <div className="text-[11.5px] text-(--color-danger-text) mt-1 max-w-[180px] truncate" title={row.blockedReason}>
            {row.blockedReason}
          </div>
        )}
      </Td>
      <Td className="tabular-nums text-(--color-text-secondary)">
        {deadline ? (
          <>
            {formatDate(deadline)}
            {row.daysLeft !== null && (
              <div className={`text-[11.5px] ${row.daysLeft < 0 ? "text-(--color-danger-text)" : row.daysLeft <= 7 ? "text-(--color-gold-text)" : "text-(--color-text-muted)"}`}>
                {row.daysLeft < 0 ? `dépassée de ${-row.daysLeft} j` : `dans ${row.daysLeft} j`}
              </div>
            )}
          </>
        ) : (
          "—"
        )}
      </Td>
      <Td align="right" className="tabular-nums">
        {row.counts.students}
        <div className="text-[11.5px] text-(--color-text-muted)">{row.counts.classes} classes</div>
      </Td>
      <Td align="right" className="tabular-nums">{formatAmount(row.paidTotal)}</Td>
      <Td align="right" className="tabular-nums text-(--color-text-muted)">{formatDate(row.createdAt)}</Td>
    </tr>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "success" | "gold" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-(--color-success-text)"
      : tone === "gold"
        ? "text-(--color-gold-text-dark)"
        : tone === "danger"
          ? "text-(--color-danger-text)"
          : "";
  return (
    <Card>
      <div className="text-[12.5px] text-(--color-text-muted) font-medium">{label}</div>
      <div className={`text-[26px] font-bold tracking-tight mt-1.5 tabular-nums ${color}`}>{value}</div>
      <div className="text-[12px] text-(--color-text-muted) mt-0.5">{hint}</div>
    </Card>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className="text-[11.5px] uppercase tracking-wider text-(--color-text-muted) py-3 px-3 font-semibold whitespace-nowrap"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td className={`py-3 px-3 text-[13.5px] align-top ${className}`} style={{ textAlign: align }}>
      {children}
    </td>
  );
}
