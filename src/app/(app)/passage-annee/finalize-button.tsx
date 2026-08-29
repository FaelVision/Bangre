"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { finalizeYearTransitionAction } from "@/lib/actions/promotion";

export function FinalizeButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const res = await finalizeYearTransitionAction();
          if (res?.error) alert(res.error);
          else router.refresh();
        })
      }
      disabled={pending}
      className="h-[38px] rounded-[9px] bg-(--color-primary) text-white flex items-center px-4 text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
    >
      {pending ? "…" : "Terminer le passage d'année"}
    </button>
  );
}
