"use client";

import { ShoppingBag } from "lucide-react";
import { useCart } from "./CartContext";
import { formatMoney } from "@/lib/money";

type Props = {
  onClick: () => void;
};

export function CartFab({ onClick }: Props) {
  const { itemCount, total } = useCart();
  if (itemCount === 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-4 right-4 z-20 flex items-center gap-3 rounded-full bg-mondy-red px-5 py-3 shadow-xl ring-2 ring-white transition-all duration-200 ease-mondy hover:bg-mondy-red-dark active:scale-[0.97] lg:hidden"
    >
      <span className="relative grid h-7 w-7 place-items-center">
        <ShoppingBag className="h-5 w-5 text-white" />
        <span
          className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-mondy-yellow px-1 font-sans text-[11px] font-bold tabular text-mondy-red-dark ring-2 ring-mondy-red"
          aria-label={`${itemCount} items in cart`}
        >
          {itemCount}
        </span>
      </span>
      <span className="font-display text-base font-bold tabular text-white">
        {formatMoney(total)}
      </span>
    </button>
  );
}
