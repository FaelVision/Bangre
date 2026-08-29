"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { OfflineStatusCard } from "@/components/offline-status";
import { logoutAction } from "@/lib/actions/auth";

type NavItem = {
  href: string;
  label: string;
  count?: number;
  badgeTone?: "danger";
};

export function Sidebar({
  schoolName,
  academicYearLabel,
  contactInitials,
  contactName,
  counts,
}: {
  schoolName: string;
  academicYearLabel: string;
  contactInitials: string;
  contactName: string;
  counts: { classesCount: number; studentsCount: number; lateCount: number };
}) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: "/tableau-de-bord", label: "Tableau de bord" },
    { href: "/classes", label: "Classes", count: counts.classesCount },
    { href: "/eleves", label: "Élèves", count: counts.studentsCount },
    { href: "/retards", label: "Retards de paiement", count: counts.lateCount, badgeTone: "danger" },
    { href: "/paiements", label: "Paiements & reçus" },
    { href: "/passage-annee", label: "Passage d'année" },
  ];

  return (
    <div className="w-[246px] shrink-0 bg-(--color-bg-sidebar) border-r border-(--color-border) p-3.5 flex flex-col gap-0.5 sticky top-0 h-screen">
      <div className="flex items-center gap-2.5 px-2 pb-4.5">
        <Image src="/logo-bangre.jpg" alt="Bangre" width={38} height={38} className="rounded-full object-cover shrink-0" />
        <div>
          <div className="text-[16.5px] font-semibold tracking-tight leading-tight">Bangre</div>
          <div className="text-[11.5px] text-(--color-text-muted) mt-0.5">
            {schoolName} · {academicYearLabel}
          </div>
        </div>
      </div>

      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center justify-between gap-2 px-2.5 py-2.5 rounded-[9px] text-sm no-underline hover:no-underline",
              active ? "bg-(--color-success-bg-alt) text-(--color-success-text-dark) font-semibold" : "text-[#57504A] font-medium hover:bg-white"
            )}
          >
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  item.badgeTone === "danger" && item.count > 0
                    ? "font-semibold px-1.5 py-0.5 rounded-full bg-(--color-danger-bg) text-(--color-danger-text)"
                    : "text-(--color-text-placeholder)"
                )}
              >
                {item.count}
              </span>
            )}
          </Link>
        );
      })}

      <div className="flex-1" />

      <OfflineStatusCard />

      <div className="flex items-center gap-2.5 px-2 py-2.5 mt-1.5">
        <span className="w-[26px] h-[26px] rounded-full bg-(--color-gold-chip-bg) text-(--color-success-text-dark) flex items-center justify-center text-[11px] font-bold shrink-0">
          {contactInitials}
        </span>
        <span className="text-[13px] text-(--color-text-mutedalt) flex-1 truncate">{contactName}</span>
        <form action={logoutAction}>
          <button type="submit" className="text-[12px] text-(--color-text-muted) hover:text-(--color-danger-text) cursor-pointer">
            Quitter
          </button>
        </form>
      </div>
    </div>
  );
}
