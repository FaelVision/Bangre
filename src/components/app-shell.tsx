"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

export type ShellCounts = { classesCount: number; studentsCount: number; lateCount: number };

/**
 * App frame. On large screens the sidebar is a permanent column; below `lg`
 * it becomes an off-canvas drawer opened from a compact top bar, so the whole
 * width of a phone stays available for the page itself.
 */
export function AppShell({
  schoolName,
  academicYearLabel,
  contactInitials,
  contactName,
  counts,
  children,
}: {
  schoolName: string;
  academicYearLabel: string;
  contactInitials: string;
  contactName: string;
  counts: ShellCounts;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating closes the drawer. Adjusting state during render on a changed
  // value is React's documented alternative to a setState-in-effect here.
  const [renderedPath, setRenderedPath] = useState(pathname);
  if (pathname !== renderedPath) {
    setRenderedPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-(--color-bg-app) lg:flex">
      <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-3.5 border-b border-(--color-border) bg-(--color-bg-sidebar)">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          className="w-9 h-9 shrink-0 rounded-[9px] border border-(--color-border-strong) bg-white flex flex-col items-center justify-center gap-[3px] cursor-pointer"
        >
          <span className="block w-[15px] h-[1.5px] bg-(--color-text)" />
          <span className="block w-[15px] h-[1.5px] bg-(--color-text)" />
          <span className="block w-[15px] h-[1.5px] bg-(--color-text)" />
        </button>
        <Image src="/logo-bangre.jpg" alt="" width={30} height={30} className="rounded-full object-cover shrink-0" />
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold tracking-tight leading-tight">Bangre</div>
          <div className="text-[11px] text-(--color-text-muted) truncate">
            {schoolName} · {academicYearLabel}
          </div>
        </div>
        {counts.lateCount > 0 && (
          <span className="ml-auto shrink-0 text-[11.5px] font-semibold px-2 py-1 rounded-full bg-(--color-danger-bg) text-(--color-danger-text) tabular-nums">
            {counts.lateCount} en retard
          </span>
        )}
      </div>

      {open && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-[#281C14]/45 cursor-default"
        />
      )}

      <Sidebar
        schoolName={schoolName}
        academicYearLabel={academicYearLabel}
        contactInitials={contactInitials}
        contactName={contactName}
        counts={counts}
        open={open}
        onClose={() => setOpen(false)}
      />

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
