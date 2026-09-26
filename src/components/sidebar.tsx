"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { OfflineStatusCard } from "@/components/offline-status";
import { InstallAppButton } from "@/components/install-app";
import { probe } from "@/lib/connectivity";
import { clearMirror } from "@/lib/offline-mirror";
import { forgetOfflinePreparation } from "@/lib/offline-ready";

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
  open = false,
  onClose,
  activePath,
}: {
  schoolName: string;
  academicYearLabel: string;
  contactInitials: string;
  contactName: string;
  counts: { classesCount: number; studentsCount: number; lateCount: number };
  /** Drawer state below `lg`; ignored on large screens where the column is permanent. */
  open?: boolean;
  onClose?: () => void;
  /** Set by the offline shell, which routes without the Next.js router. */
  activePath?: string;
}) {
  const routerPathname = usePathname();
  const pathname = activePath ?? routerPathname;

  const items: NavItem[] = [
    { href: "/tableau-de-bord", label: "Tableau de bord" },
    { href: "/classes", label: "Classes", count: counts.classesCount },
    { href: "/eleves", label: "Élèves", count: counts.studentsCount },
    { href: "/retards", label: "Retards de paiement", count: counts.lateCount, badgeTone: "danger" },
    { href: "/paiements", label: "Paiements & reçus" },
    { href: "/passage-annee", label: "Passage d'année" },
  ];

  return (
    <div
      className={cn(
        "bg-(--color-bg-sidebar) border-r border-(--color-border) p-3.5 flex flex-col gap-0.5 overflow-y-auto",
        // Drawer below lg, permanent column from lg up.
        "fixed inset-y-0 left-0 z-50 w-[262px] max-w-[85vw] transition-transform duration-200 ease-out",
        "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-[246px] lg:max-w-none lg:shrink-0 lg:translate-x-0",
        open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      )}
    >
      <div className="flex items-center gap-2.5 px-2 pb-4.5">
        <Image src="/logo-bangre.jpg" alt="Bangre" width={38} height={38} className="rounded-full object-cover shrink-0" />
        <div className="min-w-0">
          <div className="text-[16.5px] font-semibold tracking-tight leading-tight">Bangre</div>
          <div className="text-[11.5px] text-(--color-text-muted) mt-0.5">
            {schoolName} · {academicYearLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le menu"
          className="lg:hidden ml-auto w-8 h-8 shrink-0 rounded-[9px] border border-(--color-border-strong) bg-white flex items-center justify-center text-[15px] text-(--color-text-mutedalt) cursor-pointer"
        >
          ✕
        </button>
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

      <InstallAppButton />
      <OfflineStatusCard />

      <div className="flex items-center gap-2.5 px-2 py-2.5 mt-1.5">
        <span className="w-[26px] h-[26px] rounded-full bg-(--color-gold-chip-bg) text-(--color-success-text-dark) flex items-center justify-center text-[11px] font-bold shrink-0">
          {contactInitials}
        </span>
        <span className="text-[13px] text-(--color-text-mutedalt) flex-1 truncate">{contactName}</span>
        <LogoutButton />
      </div>
    </div>
  );
}

/**
 * Signing out takes the local copy of the school with it — so it is only done
 * once the server has been reached. Offline, the copy would be erased while
 * the session stayed open: the worst of both.
 */
function LogoutButton() {
  const [state, setState] = useState<"idle" | "checking" | "offline">("idle");

  async function logout() {
    setState("checking");
    if (!(await probe())) {
      setState("offline");
      return;
    }
    forgetOfflinePreparation();
    await clearMirror();
    // A route handler, not a page: a full request clears the cookie and redirects.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/deconnexion");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void logout()}
        disabled={state === "checking"}
        className="text-[12px] text-(--color-text-muted) hover:text-(--color-danger-text) cursor-pointer disabled:opacity-50"
      >
        Quitter
      </button>
      {state === "offline" && (
        <div className="absolute bottom-full right-0 mb-2 w-[210px] rounded-lg border border-(--color-gold-border) bg-(--color-gold-bg) p-2.5 text-[11.5px] leading-snug text-(--color-text-secondary) shadow-lg">
          Pas de connexion : la déconnexion se fait en ligne, pour ne pas effacer les données de cet appareil.
          <button
            type="button"
            onClick={() => setState("idle")}
            className="block mt-1.5 font-semibold text-(--color-primary) cursor-pointer"
          >
            Compris
          </button>
        </div>
      )}
    </div>
  );
}
