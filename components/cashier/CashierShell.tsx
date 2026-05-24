"use client";

import { useState } from "react";
import type { CategoryWithItems } from "@/lib/menu";
import { CartProvider } from "./CartContext";
import { TopBar } from "./TopBar";
import { MenuGrid } from "./MenuGrid";
import { CartPanel } from "./CartPanel";
import { CartFab } from "./CartFab";
import { CheckoutModal } from "./CheckoutModal";

type Table = {
  id: string;
  number: number;
  label: string | null;
  capacity: number;
  status: string;
};

type Props = {
  categories: CategoryWithItems[];
  tables: Table[];
  taxRate: number;
  defaultDeliveryFee: number;
  staffId: string;
  staffName: string;
  staffRole: string;
  signOutAction: () => Promise<void>;
  logoUrl: string | null;
  hasOpenShift: boolean;
  shiftStartedAt: Date | string | null;
};

export function CashierShell({
  categories,
  tables,
  taxRate,
  defaultDeliveryFee,
  staffId,
  staffName,
  staffRole,
  signOutAction,
  logoUrl,
  hasOpenShift,
  shiftStartedAt,
}: Props) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [searchValue, setSearchValue] = useState("");
  const [cartOpenMobile, setCartOpenMobile] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  function handleCheckout() {
    // Close the mobile cart sheet (if open) so the modal isn't behind it
    setCartOpenMobile(false);
    setCheckoutOpen(true);
  }

  return (
    <CartProvider taxRate={taxRate} defaultDeliveryFee={defaultDeliveryFee}>
      <div className="flex h-screen w-full flex-col overflow-hidden">
        <TopBar
          staffName={staffName}
          staffRole={staffRole}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          signOutAction={signOutAction}
          logoUrl={logoUrl}
          hasOpenShift={hasOpenShift}
          shiftStartedAt={shiftStartedAt}
        />

        <div className="flex min-h-0 flex-1">
          {/* Menu zone */}
          <div className="flex min-h-0 flex-1 flex-col">
            <MenuGrid
              categories={categories}
              activeCategoryId={activeCategoryId}
              onCategoryChange={setActiveCategoryId}
              searchValue={searchValue}
            />
          </div>

          {/* Cart zone — visible on lg+, hidden below */}
          <div className="hidden h-full lg:block">
            <CartPanel
              tables={tables}
              taxRate={taxRate}
              staffId={staffId}
              staffRole={staffRole}
              onCheckout={handleCheckout}
            />
          </div>
        </div>

        {/* Mobile cart FAB — appears when cart has items */}
        <CartFab onClick={() => setCartOpenMobile(true)} />

        {/* Mobile cart sheet */}
        {cartOpenMobile && (
          <div
            className="fixed inset-0 z-30 flex flex-col bg-mondy-ink/50 backdrop-blur-sm lg:hidden"
            onClick={() => setCartOpenMobile(false)}
          >
            <button
              type="button"
              className="flex-1"
              aria-label="Close cart"
              onClick={() => setCartOpenMobile(false)}
            />
            <div
              className="h-[85vh] overflow-hidden rounded-t-3xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex h-9 items-center justify-center">
                <span
                  aria-hidden
                  className="h-1.5 w-12 rounded-full bg-mondy-border"
                />
              </div>
              <div className="h-[calc(85vh-2.25rem)]">
                <CartPanel
                  tables={tables}
                  taxRate={taxRate}
                  staffId={staffId}
                  staffRole={staffRole}
                  onCheckout={handleCheckout}
                />
              </div>
            </div>
          </div>
        )}

        {/* Checkout modal */}
        {checkoutOpen && (
          <CheckoutModal
            staffId={staffId}
            taxRate={taxRate}
            onClose={() => setCheckoutOpen(false)}
            onComplete={() => setCheckoutOpen(false)}
          />
        )}
      </div>
    </CartProvider>
  );
}