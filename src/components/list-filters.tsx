"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

type SelectFilter = {
  name: string;
  value?: string;
  options: { value: string; label: string }[];
};

/**
 * Filter bar for the list pages. Changing a dropdown navigates immediately —
 * no "Filtrer" button to press. The text search applies on submit (Enter or
 * the button), since re-navigating on every keystroke would lose focus when the
 * server re-renders the list.
 */
export function ListFilters({
  basePath,
  currentParams,
  searchParam,
  selects,
}: {
  basePath: string;
  currentParams: Record<string, string | undefined>;
  searchParam?: { name: string; placeholder: string; value?: string };
  selects: SelectFilter[];
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  function navigate(overrides: Record<string, string>) {
    const params = new URLSearchParams();
    const merged = { ...currentParams, ...overrides };
    for (const [key, val] of Object.entries(merged)) {
      if (key === "page") continue; // any filter change returns to page 1
      if (val && val.trim() !== "") params.set(key, val);
    }
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <form
      className="flex gap-2.5 items-center mb-3.5 flex-wrap"
      onSubmit={(e) => {
        e.preventDefault();
        if (searchParam) navigate({ [searchParam.name]: searchRef.current?.value ?? "" });
      }}
    >
      {searchParam && (
        <input
          ref={searchRef}
          name={searchParam.name}
          defaultValue={searchParam.value ?? ""}
          placeholder={searchParam.placeholder}
          className="flex-1 min-w-[220px] h-10 border border-(--color-border-strong) rounded-[10px] bg-white px-3.5 text-[13.5px] placeholder:text-(--color-text-placeholder) focus:outline-none focus:border-(--color-primary)"
        />
      )}

      {selects.map((select) => (
        <select
          key={select.name}
          name={select.name}
          value={select.value ?? ""}
          onChange={(e) => navigate({ [select.name]: e.target.value })}
          className="h-10 border border-(--color-border-strong) rounded-[10px] bg-white px-3 text-[13.5px] min-w-[150px]"
        >
          {select.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}

      {searchParam && (
        <button
          type="submit"
          className="h-10 rounded-[10px] border border-(--color-border-strong) bg-white px-4 text-[13.5px] font-semibold cursor-pointer"
        >
          Rechercher
        </button>
      )}
    </form>
  );
}
