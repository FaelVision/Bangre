"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { baseFieldClass } from "@/components/form";
import { autoFormatDate, frToIso, isoToFr } from "@/lib/date";

/**
 * Free-typing date field: the user types "26/11/2006" directly.
 * Submits an ISO ("YYYY-MM-DD") value through a hidden input named `name`,
 * so server actions keep receiving the same format as a native <input type="date">.
 *
 * A visible text buffer is kept internally in every mode. In controlled mode
 * (`value` given) the parent only ever sees completed ISO dates, but the buffer
 * still holds the half-typed "26/11/20" in between — without it, each keystroke
 * would round-trip through an empty ISO and vanish.
 */
export function DateInput({
  name,
  defaultValue,
  value,
  onValueChange,
  required,
  className,
}: {
  name?: string;
  /** ISO or human string used as the initial visible value (uncontrolled). */
  defaultValue?: string | Date | null;
  /** ISO string — the parent's source of truth; the field still buffers typing. */
  value?: string;
  onValueChange?: (iso: string) => void;
  required?: boolean;
  className?: string;
}) {
  const controlled = value !== undefined;
  const [text, setText] = useState(() => isoToFr(value ?? defaultValue ?? ""));
  const lastEmitted = useRef(frToIso(text));

  // Reconcile the buffer when the controlled value changes to a date that is not
  // what the user is currently typing (e.g. the parent reset it, or a different
  // row reused this field). A partial entry parses to "" and is left untouched.
  useEffect(() => {
    if (!controlled) return;
    if ((value ?? "") !== lastEmitted.current && frToIso(text) !== (value ?? "")) {
      // Syncing the visible buffer to an external value change, not deriving
      // render state — the parent owns the date, this field owns the keystrokes.
      setText(isoToFr(value ?? ""));
      lastEmitted.current = value ?? "";
    }
  }, [controlled, value, text]);

  const iso = frToIso(text);
  const invalid = text.trim().length > 0 && !iso;
  const describedById = useId();

  function handleChange(raw: string) {
    const next = autoFormatDate(raw);
    setText(next);
    const nextIso = frToIso(next);
    lastEmitted.current = nextIso;
    onValueChange?.(nextIso);
  }

  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="jj/mm/aaaa"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? describedById : undefined}
        className={cn(baseFieldClass, "h-[46px] tabular-nums", invalid && "border-(--color-danger-border)", className)}
      />
      {name && <input type="hidden" name={name} value={iso} />}
      {invalid && (
        <span id={describedById} className="mt-1 block text-[11.5px] text-(--color-danger-text)">
          Format attendu : jj/mm/aaaa (ex. 26/11/2006)
        </span>
      )}
    </>
  );
}
