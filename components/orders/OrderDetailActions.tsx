"use client";

import { useState } from "react";
import Link from "next/link";
import { Ban, Printer } from "lucide-react";
import { VoidOrderModal } from "./VoidOrderModal";

type Props = {
  orderId: string;
  orderNumber: number;
  orderTotal: number;
  canVoid: boolean; // false if already voided
};

export function OrderDetailActions({
  orderId,
  orderNumber,
  orderTotal,
  canVoid,
}: Props) {
  const [voidOpen, setVoidOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/orders/${orderId}/receipt`}
          className="inline-flex items-center gap-2 rounded-xl border border-mondy-border bg-white px-4 py-2.5 font-sans text-sm font-medium text-mondy-ink transition hover:bg-mondy-cream"
        >
          <Printer className="h-4 w-4" />
          Receipt
        </Link>
        {canVoid && (
          <button
            type="button"
            onClick={() => setVoidOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-mondy-red/30 bg-white px-4 py-2.5 font-sans text-sm font-medium text-mondy-red-dark transition hover:bg-mondy-red/5"
          >
            <Ban className="h-4 w-4" />
            Void order
          </button>
        )}
      </div>

      {voidOpen && (
        <VoidOrderModal
          orderId={orderId}
          orderNumber={orderNumber}
          orderTotal={orderTotal}
          onClose={() => setVoidOpen(false)}
        />
      )}
    </>
  );
}