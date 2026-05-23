"use client";

import { useMemo, useState } from "react";
import type { CategoryWithItems, MenuItemWithModifiers } from "@/lib/menu";
import { useCart, type SpiceLevel } from "./CartContext";
import { formatMoney } from "@/lib/money";
import { Flame } from "lucide-react";
import { SpiceModifierModal } from "./SpiceModifierModal";

type Props = {
  categories: CategoryWithItems[];
  activeCategoryId: string | null;
  onCategoryChange: (id: string) => void;
  searchValue: string;
};

export function MenuGrid({
  categories,
  activeCategoryId,
  onCategoryChange,
  searchValue,
}: Props) {
  const trimmed = searchValue.trim().toLowerCase();
  const isSearching = trimmed.length > 0;
  const { addItem } = useCart();
  // Item currently awaiting spice selection. null = no modal.
  const [spicePending, setSpicePending] = useState<MenuItemWithModifiers | null>(null);

  const itemsToShow = useMemo(() => {
    if (isSearching) {
      return categories.flatMap((c) =>
        c.items.filter((i) => i.name.toLowerCase().includes(trimmed)),
      );
    }
    const active = categories.find((c) => c.id === activeCategoryId);
    return active?.items ?? [];
  }, [categories, activeCategoryId, isSearching, trimmed]);

  function handleTileTap(item: MenuItemWithModifiers) {
    if (item.hasSpiceModifier) {
      setSpicePending(item);
    } else {
      addItem(item.id, item.name, item.price);
    }
  }

  function handleSpiceSelect(spice: SpiceLevel) {
    if (!spicePending) return;
    addItem(spicePending.id, spicePending.name, spicePending.price, spice);
    setSpicePending(null);
  }

  function handleSpiceSkip() {
    if (!spicePending) return;
    addItem(spicePending.id, spicePending.name, spicePending.price);
    setSpicePending(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-mondy-cream">
      {/* Category tabs */}
      <div className="border-b border-mondy-border bg-white">
        <div className="flex gap-1 overflow-x-auto px-3 py-2 scrollbar-thin sm:px-5">
          {categories.map((c) => {
            const active = !isSearching && c.id === activeCategoryId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onCategoryChange(c.id)}
                className={`shrink-0 rounded-xl px-4 py-2 font-display text-sm font-semibold transition-all duration-200 ease-mondy ${
                  active
                    ? "bg-mondy-red text-white shadow-sm"
                    : "text-mondy-ink hover:bg-mondy-cream"
                }`}
              >
                {c.name}
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-sans font-medium tabular ${
                    active
                      ? "bg-white/20 text-white"
                      : "bg-mondy-yellow-soft/60 text-mondy-red-dark"
                  }`}
                >
                  {c.items.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Item grid */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        {isSearching && (
          <p className="mb-3 font-sans text-xs uppercase tracking-widest text-mondy-muted">
            {itemsToShow.length} match{itemsToShow.length === 1 ? "" : "es"} for &ldquo;{searchValue}&rdquo;
          </p>
        )}

        {itemsToShow.length === 0 ? (
          <div className="flex h-full items-center justify-center pt-16">
            <p className="font-display italic text-mondy-muted">
              {isSearching ? "No items match your search." : "No items in this category."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
            {itemsToShow.map((item) => (
              <MenuTile key={item.id} item={item} onTap={handleTileTap} />
            ))}
          </div>
        )}
      </div>

      {spicePending && (
        <SpiceModifierModal
          itemName={spicePending.name}
          itemPrice={spicePending.price}
          onSelect={handleSpiceSelect}
          onSkip={handleSpiceSkip}
          onClose={() => setSpicePending(null)}
        />
      )}
    </div>
  );
}

function MenuTile({
  item,
  onTap,
}: {
  item: MenuItemWithModifiers;
  onTap: (item: MenuItemWithModifiers) => void;
}) {
  const soldOut = !item.isAvailable;

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => onTap(item)}
      className={`group relative flex aspect-square flex-col justify-between overflow-hidden rounded-2xl p-3 text-left transition-all duration-200 ease-mondy sm:p-4 ${
        soldOut
          ? "cursor-not-allowed bg-mondy-cream/60 ring-1 ring-mondy-border"
          : "bg-white shadow-sm ring-1 ring-mondy-border hover:-translate-y-0.5 hover:shadow-md hover:ring-mondy-red/40 active:scale-[0.97]"
      }`}
    >
      {/* Header: item name */}
      <div className="flex-1">
        <p
          className={`font-display text-sm font-semibold leading-tight sm:text-base ${
            soldOut ? "text-mondy-muted" : "text-mondy-ink"
          }`}
        >
          {item.name}
        </p>
      </div>

      {/* Footer: price + spice marker */}
      <div className="mt-2 flex items-end justify-between">
        <span
          className={`font-display text-lg font-bold tabular sm:text-xl ${
            soldOut ? "text-mondy-muted" : "text-mondy-red"
          }`}
        >
          {formatMoney(item.price)}
        </span>
        {item.hasSpiceModifier && !soldOut && (
          <span
            title="Spice level customizable"
            aria-label="Spice level customizable"
            className="text-mondy-red-soft"
          >
            <Flame className="h-4 w-4" />
          </span>
        )}
      </div>

      {/* Sold-out overlay */}
      {soldOut && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rotate-[-8deg] rounded-md bg-mondy-ink/85 px-3 py-1 font-sans text-xs font-bold uppercase tracking-widest text-white shadow">
            Sold Out
          </span>
        </div>
      )}
    </button>
  );
}
