import Link from "next/link";
import { Utensils, ShoppingBag, Truck, ChevronRight, Ban } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { paymentLabel } from "./StatsSummary";
import type { OrderListRow } from "@/lib/orders";

export function OrderList({ orders }: { orders: OrderListRow[] }) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-12 text-center ring-1 ring-mondy-border">
        <p className="font-display text-lg text-mondy-ink">
          No orders in this range yet
        </p>
        <p className="mt-1 font-sans text-sm text-mondy-muted">
          Once orders come in, they&apos;ll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-mondy-border">
      {/* Header row (desktop only — mobile uses card-style rows below) */}
      <div className="hidden border-b border-mondy-border bg-mondy-cream/50 px-4 py-2.5 lg:grid lg:grid-cols-12 lg:gap-3">
        <div className="col-span-2 font-sans text-[10px] uppercase tracking-widest text-mondy-muted">
          Order
        </div>
        <div className="col-span-2 font-sans text-[10px] uppercase tracking-widest text-mondy-muted">
          Type
        </div>
        <div className="col-span-2 font-sans text-[10px] uppercase tracking-widest text-mondy-muted">
          Staff
        </div>
        <div className="col-span-2 font-sans text-[10px] uppercase tracking-widest text-mondy-muted">
          Items
        </div>
        <div className="col-span-2 font-sans text-[10px] uppercase tracking-widest text-mondy-muted">
          Payment
        </div>
        <div className="col-span-2 text-right font-sans text-[10px] uppercase tracking-widest text-mondy-muted">
          Total
        </div>
      </div>

      <ul className="divide-y divide-mondy-border">
        {orders.map((o) => (
          <li key={o.id}>
            <Link
              href={`/orders/${o.id}`}
              className="block px-4 py-3 transition hover:bg-mondy-cream/40 lg:px-4"
            >
              {/* Mobile layout */}
              <div className="flex items-center justify-between gap-3 lg:hidden">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-base font-bold text-mondy-ink tabular">
                      #{o.orderNumber}
                    </span>
                    <OrderTypeBadge type={o.orderType} />
                    {o.status === "VOIDED" && (
                      <span className="rounded bg-mondy-red/10 px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wider text-mondy-red-dark">
                        Void
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-sans text-xs text-mondy-muted">
                    {formatTime(o.createdAt)} · {o.staffName} ·{" "}
                    {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                    {o.tableNumber && ` · T${o.tableNumber}`}
                    {o.customerName && ` · ${o.customerName}`}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`font-display text-base font-bold tabular ${
                      o.status === "VOIDED"
                        ? "text-mondy-muted line-through"
                        : "text-mondy-ink"
                    }`}
                  >
                    {formatMoney(o.total)}
                  </p>
                  {o.primaryPaymentMethod && (
                    <p className="font-sans text-[10px] text-mondy-muted">
                      {paymentLabel(o.primaryPaymentMethod)}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-mondy-muted" />
              </div>

              {/* Desktop layout */}
              <div className="hidden lg:grid lg:grid-cols-12 lg:items-center lg:gap-3">
                <div className="col-span-2">
                  <p className="font-display text-base font-bold text-mondy-ink tabular">
                    #{o.orderNumber}
                  </p>
                  <p className="font-sans text-[11px] text-mondy-muted tabular">
                    {formatTime(o.createdAt)}
                  </p>
                </div>
                <div className="col-span-2">
                  <OrderTypeBadge type={o.orderType} />
                  {o.tableNumber && (
                    <p className="mt-1 font-sans text-[11px] text-mondy-muted">
                      Table {o.tableNumber}
                    </p>
                  )}
                  {o.customerName && (
                    <p className="mt-1 font-sans text-[11px] text-mondy-muted line-clamp-1">
                      {o.customerName}
                    </p>
                  )}
                </div>
                <div className="col-span-2 font-sans text-sm text-mondy-ink line-clamp-1">
                  {o.staffName}
                </div>
                <div className="col-span-2 font-sans text-sm text-mondy-ink tabular">
                  {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                </div>
                <div className="col-span-2 font-sans text-sm text-mondy-muted line-clamp-1">
                  {o.primaryPaymentMethod
                    ? paymentLabel(o.primaryPaymentMethod)
                    : "—"}
                </div>
                <div className="col-span-2 flex items-center justify-end gap-2">
                  {o.status === "VOIDED" && (
                    <Ban className="h-3.5 w-3.5 text-mondy-red-dark" />
                  )}
                  <p
                    className={`font-display text-base font-bold tabular ${
                      o.status === "VOIDED"
                        ? "text-mondy-muted line-through"
                        : "text-mondy-ink"
                    }`}
                  >
                    {formatMoney(o.total)}
                  </p>
                  <ChevronRight className="h-4 w-4 text-mondy-muted" />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrderTypeBadge({
  type,
}: {
  type: "DINE_IN" | "TAKEOUT" | "DELIVERY";
}) {
  if (type === "DINE_IN") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-mondy-yellow-soft/60 px-2 py-0.5 font-sans text-[10px] font-semibold text-mondy-red-dark">
        <Utensils className="h-2.5 w-2.5" />
        Dine in
      </span>
    );
  }
  if (type === "DELIVERY") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-mondy-red/10 px-2 py-0.5 font-sans text-[10px] font-semibold text-mondy-red-dark ring-1 ring-mondy-red/20">
        <Truck className="h-2.5 w-2.5" />
        Delivery
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-mondy-cream px-2 py-0.5 font-sans text-[10px] font-semibold text-mondy-ink ring-1 ring-mondy-border">
      <ShoppingBag className="h-2.5 w-2.5" />
      Takeout
    </span>
  );
}

function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}