import Link from "next/link";
import { adminLogoutAction } from "@/lib/actions/admin";
import { cn } from "@/lib/cn";

/** Chrome shared by every signed-in admin page: top bar + tabs. */
export function AdminShell({
  adminName,
  current,
  openErrors,
  children,
}: {
  adminName: string;
  current: "ecoles" | "erreurs";
  openErrors: number;
  children: React.ReactNode;
}) {
  const tabs = [
    { key: "ecoles" as const, href: "/admin", label: "Établissements" },
    { key: "erreurs" as const, href: "/admin/erreurs", label: "Erreurs du site", badge: openErrors },
  ];

  return (
    <div className="min-h-screen bg-(--color-bg-page)">
      <div className="bg-[#12100E] text-[#F7EFE4]">
        <div className="max-w-[1180px] mx-auto px-4 lg:px-7">
          <div className="flex items-center gap-3 h-14">
            <span className="w-7 h-7 rounded-lg bg-(--color-primary) text-white flex items-center justify-center text-[13px] font-bold shrink-0">
              B
            </span>
            <div className="text-[14.5px] font-semibold tracking-tight">Bangre · Administration</div>
            <div className="flex-1" />
            <span className="text-[12.5px] text-[#F7EFE4]/55 hidden sm:inline truncate max-w-[160px]">{adminName}</span>
            <form action={adminLogoutAction}>
              <button
                type="submit"
                className="text-[12.5px] text-[#F7EFE4]/70 hover:text-white cursor-pointer whitespace-nowrap"
              >
                Quitter
              </button>
            </form>
          </div>

          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className={cn(
                  "flex items-center gap-2 px-3.5 h-10 text-[13.5px] font-medium border-b-2 no-underline hover:no-underline whitespace-nowrap",
                  current === t.key
                    ? "border-(--color-primary) text-white"
                    : "border-transparent text-[#F7EFE4]/55 hover:text-[#F7EFE4]"
                )}
              >
                {t.label}
                {t.badge ? (
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-(--color-danger-text) text-white tabular-nums">
                    {t.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1180px] mx-auto px-4 lg:px-7 py-5 lg:py-7 pb-14">{children}</div>
    </div>
  );
}
