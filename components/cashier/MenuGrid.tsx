"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryWithItems, MenuItemWithModifiers } from "@/lib/menu";
import { useCart } from "./CartContext";
import { formatMoney } from "@/lib/money";
import { SlidersHorizontal } from "lucide-react";
import { OptionPicker } from "@/components/menu/OptionPicker";
import { priceStartsFrom } from "@/lib/options";
import { barcodeVariants } from "@/lib/barcode";
import { lookUpBarcode, type ScanItem, type ScanLookup } from "@/app/api/barcode/actions";
import { CameraScanner, ScanButton, UnknownScan, useScannerInput } from "./BarcodeScan";

type Props = {
  categories: CategoryWithItems[];
  activeCategoryId: string | null;
  onCategoryChange: (id: string) => void;
  searchValue: string;
  staffRole: string;
  /** A scanner typed into the search box: clear it. */
  onScanned: (code: string) => void;
};

export function MenuGrid({
  categories,
  activeCategoryId,
  onCategoryChange,
  searchValue,
  staffRole,
  onScanned,
}: Props) {
  const trimmed = searchValue.trim().toLowerCase();
  const isSearching = trimmed.length > 0;
  const { addItem } = useCart();
  // Dish waiting for its choices (hot/iced, protein…). null = no picker open.
  const [choosing, setChoosing] = useState<MenuItemWithModifiers | null>(null);

  const itemsToShow = useMemo(() => {
    if (isSearching) {
      // Typing "7" finds menu item #7, so staff can ring up "a number 7".
      return categories.flatMap((c) =>
        c.items.filter(
          (i) => i.name.toLowerCase().includes(trimmed) || (i.menuNumber != null && String(i.menuNumber) === trimmed),
        ),
      );
    }
    const active = categories.find((c) => c.id === activeCategoryId);
    return active?.items ?? [];
  }, [categories, activeCategoryId, isSearching, trimmed]);

  // ── Barcodes ──
  const router = useRouter();
  const [camera, setCamera] = useState(false);
  const [unknown, setUnknown] = useState<Extract<ScanLookup, { status: "unknown" | "hidden" }> | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManager = staffRole === "OWNER" || staffRole === "MANAGER";

  const say = useCallback((ok: boolean, text: string) => {
    setToast({ ok, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const sell = useCallback(
    (item: Pick<MenuItemWithModifiers, "id" | "name" | "price" | "isAvailable" | "optionGroups">) => {
      if (!item.isAvailable) return say(false, `${item.name} is marked sold out`);
      if (item.optionGroups.length > 0) return setChoosing(item as MenuItemWithModifiers);
      addItem(item.id, item.name, item.price);
      say(true, `${item.name} · ${formatMoney(item.price)} added`);
    },
    [addItem, say],
  );

  const handleCode = useCallback(
    async (raw: string) => {
      onScanned(raw);
      const forms = barcodeVariants(raw);
      const local = categories.flatMap((c) => c.items).find((i) => i.barcode && forms.includes(i.barcode));
      if (local) return sell(local);
      try {
        const r = await lookUpBarcode(raw);
        if (r.status === "error") return say(false, r.error);
        if (r.status === "ok") {
          // Added since this register loaded its menu.
          router.refresh();
          if (r.item.hasOptions) return say(true, `${r.item.name}: tap it on the menu to choose its options`);
          addItem(r.item.id, r.item.name, r.item.price);
          return say(true, `${r.item.name} · ${formatMoney(r.item.price)} added`);
        }
        setUnknown(r);
      } catch {
        say(false, "Couldn't look up that barcode. Check the connection.");
      }
    },
    [categories, sell, say, router, addItem, onScanned],
  );

  useScannerInput((code) => void handleCode(code), !camera && !unknown && !choosing);

  function scannedItemSaved(item: ScanItem) {
    setUnknown(null);
    router.refresh();
    if (item.hasOptions) return say(true, `Saved. Tap ${item.name} on the menu to choose its options.`);
    addItem(item.id, item.name, item.price);
    say(true, `Saved · ${item.name} · ${formatMoney(item.price)} added`);
  }

  function handleTileTap(item: MenuItemWithModifiers) {
    if (item.optionGroups.length > 0) {
      setChoosing(item);
    } else {
      addItem(item.id, item.name, item.price);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-mondy-cream">
      {/* Category tabs */}
      <div className="flex items-center gap-2 border-b border-mondy-border bg-white pr-3 sm:pr-5">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-3 py-2 scrollbar-thin sm:px-5">
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
                      ? "bg-white text-mondy-red-dark"
                      : "bg-mondy-yellow-soft/60 text-mondy-red-dark"
                  }`}
                >
                  {c.items.length}
                </span>
              </button>
            );
          })}
        </div>
        <ScanButton onClick={() => setCamera(true)} />
      </div>

      {toast && (
        <p
          role="status"
          className={`mx-3 mt-3 rounded-xl px-4 py-3 font-display text-lg font-bold shadow-sm sm:mx-5 ${
            toast.ok ? "bg-emerald-700 text-white" : "bg-mondy-red text-white"
          }`}
        >
          {toast.text}
        </p>
      )}

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

      {camera && (
        <CameraScanner
          onClose={() => setCamera(false)}
          onCode={(code) => {
            setCamera(false);
            void handleCode(code);
          }}
        />
      )}
      {unknown && (
        <UnknownScan
          lookup={unknown}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          isManager={isManager}
          onSold={scannedItemSaved}
          onClose={() => setUnknown(null)}
        />
      )}

      {choosing && (
        <OptionPicker
          name={choosing.name}
          description={choosing.description}
          basePrice={choosing.price}
          groups={choosing.optionGroups}
          onClose={() => setChoosing(null)}
          onAdd={(ids, summary, unitPrice) => {
            addItem(choosing.id, choosing.name, unitPrice, ids, summary);
            setChoosing(null);
          }}
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
      {/* Header: menu number, name, signature mark */}
      <div className="flex-1">
        {(item.menuNumber != null || item.isSignature) && (
          <p className="mb-1 flex items-center gap-1.5 font-sans text-[11px] font-semibold text-mondy-red-dark">
            {item.menuNumber != null && <span className="tabular">No. {item.menuNumber}</span>}
            {item.isSignature && (
              <span title="Rosewood Signature" aria-label="Rosewood Signature">
                ★ Signature
              </span>
            )}
          </p>
        )}
        <p
          className={`font-display text-sm font-semibold leading-tight sm:text-base ${
            soldOut ? "text-mondy-muted" : "text-mondy-ink"
          }`}
        >
          {item.name}
        </p>
      </div>

      {/* Footer: price + choices marker */}
      <div className="mt-2 flex items-end justify-between">
        <span
          className={`font-display text-lg font-bold tabular sm:text-xl ${
            soldOut ? "text-mondy-muted" : "text-mondy-red"
          }`}
        >
          {priceStartsFrom(item.optionGroups) && <span className="mr-1 text-xs font-medium">from</span>}
          {formatMoney(item.price)}
        </span>
        {!soldOut && item.portionsLeft != null && (
          <span
            className={`rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold tabular ${
              item.portionsLeft <= 3
                ? "bg-mondy-red text-white"
                : "bg-mondy-cream text-mondy-muted ring-1 ring-mondy-border"
            }`}
          >
            {item.portionsLeft} left
          </span>
        )}
        {item.optionGroups.length > 0 && !soldOut && (
          <span title="Has choices" aria-label="Has choices" className="text-mondy-red-soft">
            <SlidersHorizontal className="h-4 w-4" />
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
