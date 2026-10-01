"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveUniformCatalogAction, type UniformCatalogState } from "@/lib/actions/uniforms";
import { isNetworkError, withNetwork } from "@/lib/connectivity";
import { UNIFORM_LEVELS } from "@/lib/uniforms";
import { Field, Label, TextInput } from "@/components/form";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";

type SizeRow = { id?: string; size: string; price: string; stock: string; loadedStock?: number };

export type CatalogItemRow = {
  id?: string;
  name: string;
  levels: string[];
  trackStock: boolean;
  hasSizes: boolean;
  priceBySize: boolean;
  /** The price of every size when it does not change with the size. */
  price: string;
  sizes: SizeRow[];
};

const emptyItem = (): CatalogItemRow => ({
  name: "",
  levels: [],
  trackStock: false,
  hasSizes: false,
  priceBySize: false,
  price: "",
  sizes: [{ size: "", price: "", stock: "0" }],
});

/** The school's tenues: names, levels, sizes, prices and stock — all its own choice. */
export function UniformCatalogForm({ initial }: { initial: CatalogItemRow[] }) {
  const [state, formAction, pending] = useActionState(
    async (previous: UniformCatalogState, formData: FormData): Promise<UniformCatalogState> => {
      try {
        return await withNetwork(() => saveUniformCatalogAction(previous, formData), 20000);
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        return { error: "Pas de connexion : le catalogue s'enregistre en ligne. Réessayez au retour du réseau." };
      }
    },
    undefined
  );
  const [items, setItems] = useState<CatalogItemRow[]>(initial.length ? initial : [emptyItem()]);

  function update(i: number, patch: Partial<CatalogItemRow>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function updateSize(i: number, j: number, patch: Partial<SizeRow>) {
    setItems((prev) =>
      prev.map((it, idx) => (idx === i ? { ...it, sizes: it.sizes.map((s, k) => (k === j ? { ...s, ...patch } : s)) } : it))
    );
  }

  // What the server receives: one row per size, each with its own price.
  const payload = items.map((it) => {
    const sizes = it.hasSizes ? it.sizes : it.sizes.slice(0, 1).map((s) => ({ ...s, size: "" }));
    return {
      id: it.id,
      name: it.name,
      levels: it.levels,
      trackStock: it.trackStock,
      sizes: sizes.map((s) => ({
        id: s.id,
        size: s.size,
        price: it.hasSizes && it.priceBySize ? s.price : it.price,
        stock: s.stock,
        loadedStock: s.loadedStock,
      })),
    };
  });

  return (
    <form action={formAction}>
      <input type="hidden" name="catalog" value={JSON.stringify(payload)} />
      <div className="border-b border-(--color-border) flex flex-col lg:flex-row lg:items-center gap-3 px-4 lg:px-7 py-3.5 lg:py-0 lg:h-[70px] lg:sticky lg:top-0 bg-(--color-bg-app) lg:z-10">
        <div className="min-w-0">
          <div className="text-[12.5px] text-(--color-text-muted)">
            <Link href="/tenues" className="text-(--color-primary) font-medium">
              Tenues
            </Link>{" "}
            › Catalogue
          </div>
          <div className="text-[19px] font-semibold tracking-tight mt-0.5">Catalogue des tenues</div>
        </div>
        <div className="hidden lg:block lg:flex-1" />
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/tenues"
            className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline"
          >
            Retour
          </Link>
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>

      <div className="p-4 lg:p-7 grid gap-4 max-w-[860px]">
        {state?.error && (
          <div role="alert" className="rounded-[11px] border border-(--color-danger-border) bg-(--color-danger-bg-soft) text-(--color-danger-text) text-[13.5px] px-4 py-3">
            {state.error}
          </div>
        )}
        {state?.saved && (
          <div className="rounded-[11px] border border-(--color-success-border) bg-(--color-success-bg-soft) text-[13.5px] px-4 py-3 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-(--color-success-text-dark)">Catalogue enregistré.</span>
            <Link href="/tenues" className="text-(--color-primary) font-semibold">
              Aller aux tenues →
            </Link>
          </div>
        )}

        <p className="text-[13px] text-(--color-text-secondary) leading-relaxed">
          Ajoutez chaque tenue que vend l&apos;établissement. Les tailles, le prix selon la taille et le suivi du stock
          sont facultatifs. Une tenue déjà vendue que vous retirez reste sur ses anciens reçus.
        </p>

        {items.map((it, i) => (
          <Card key={i}>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5 items-end">
              <Field>
                <Label>Nom de la tenue</Label>
                <TextInput value={it.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Tenue scolaire" />
              </Field>
              <Button type="button" variant="ghost" className="h-[46px]" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}>
                Supprimer
              </Button>
            </div>

            <div className="mt-3">
              <div className="text-[12.5px] font-semibold text-(--color-text-secondary) mb-1.5">Proposée aux niveaux</div>
              <div className="flex flex-wrap gap-1.5">
                {UNIFORM_LEVELS.map((level) => {
                  const on = it.levels.includes(level);
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => update(i, { levels: on ? it.levels.filter((l) => l !== level) : [...it.levels, level] })}
                      className={cn(
                        "h-8 rounded-lg px-3 text-[12.5px] font-semibold cursor-pointer",
                        on ? "bg-(--color-primary) text-white" : "bg-white border border-(--color-border-strong) text-(--color-text-secondary)"
                      )}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
              <div className="text-[12px] text-(--color-text-muted) mt-1">
                {it.levels.length ? `Vendue seulement aux élèves de : ${it.levels.join(", ").toLowerCase()}.` : "Aucun niveau choisi : vendue à tous les élèves."}
              </div>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3.5">
              <Toggle checked={it.hasSizes} onChange={(v) => update(i, { hasSizes: v })}>
                Plusieurs tailles
              </Toggle>
              {it.hasSizes && (
                <Toggle checked={it.priceBySize} onChange={(v) => update(i, { priceBySize: v })}>
                  Prix différent selon la taille
                </Toggle>
              )}
              <Toggle checked={it.trackStock} onChange={(v) => update(i, { trackStock: v })}>
                Suivre le stock
              </Toggle>
            </div>

            {(!it.hasSizes || !it.priceBySize) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
                <Field>
                  <Label>{it.hasSizes ? "Prix (toutes tailles, CFA)" : "Prix (CFA)"}</Label>
                  <TextInput inputMode="numeric" value={it.price} onChange={(e) => update(i, { price: e.target.value.replace(/\D/g, "") })} placeholder="6000" />
                </Field>
                {!it.hasSizes && it.trackStock && (
                  <Field>
                    <Label>En stock</Label>
                    <TextInput
                      inputMode="numeric"
                      value={it.sizes[0]?.stock ?? "0"}
                      onChange={(e) => updateSize(i, 0, { stock: e.target.value.replace(/\D/g, "") })}
                    />
                  </Field>
                )}
              </div>
            )}

            {it.hasSizes && (
              <div className="mt-3">
                <div className="grid gap-2">
                  {it.sizes.map((s, j) => (
                    <div key={j} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_140px_120px_auto] gap-2 items-end">
                      <Field>
                        <Label>Taille</Label>
                        <TextInput value={s.size} onChange={(e) => updateSize(i, j, { size: e.target.value })} placeholder="8 ans, M, 38…" />
                      </Field>
                      {it.priceBySize ? (
                        <Field>
                          <Label>Prix (CFA)</Label>
                          <TextInput inputMode="numeric" value={s.price} onChange={(e) => updateSize(i, j, { price: e.target.value.replace(/\D/g, "") })} />
                        </Field>
                      ) : (
                        <div className="hidden sm:block" />
                      )}
                      {it.trackStock ? (
                        <Field>
                          <Label>En stock</Label>
                          <TextInput inputMode="numeric" value={s.stock} onChange={(e) => updateSize(i, j, { stock: e.target.value.replace(/\D/g, "") })} />
                        </Field>
                      ) : (
                        <div className="hidden sm:block" />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-[46px]"
                        disabled={it.sizes.length <= 1}
                        onClick={() => update(i, { sizes: it.sizes.filter((_, k) => k !== j) })}
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2.5"
                  onClick={() => update(i, { sizes: [...it.sizes, { size: "", price: it.price, stock: "0" }] })}
                >
                  + Taille
                </Button>
              </div>
            )}
          </Card>
        ))}

        <div className="flex justify-between gap-2 flex-wrap">
          <Button type="button" variant="secondary" onClick={() => setItems((prev) => [...prev, emptyItem()])}>
            + Ajouter une tenue
          </Button>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer le catalogue"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-[13px] cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-(--color-primary)" />
      {children}
    </label>
  );
}
