"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { MondysEmblem } from "@/components/login/MondysEmblem";
import { formatMoney } from "@/lib/money";
import { paymentLabel } from "./StatsSummary";
import type { OrderDetail } from "@/lib/orders";

type Settings = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxRate: number;
  currency: string;
  receiptFooter: string;
  timezone: string;
  defaultDeliveryFee: number;
};

type Props = {
  order: OrderDetail;
  settings: Settings;
  logoUrl: string | null;
};

export function ReceiptView({ order, settings, logoUrl }: Props) {
  function handlePrint() {
    window.print();
  }

  return (
    <main className="min-h-screen bg-mondy-cream py-6 print:bg-white print:py-0">
      {/* Screen-only toolbar */}
      <div className="mx-auto mb-4 flex max-w-md items-center justify-between px-4 print:hidden">
        <Link
          href={`/orders/${order.id}`}
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-sans text-xs font-medium text-mondy-ink ring-1 ring-mondy-border transition hover:bg-mondy-cream"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to order
        </Link>
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-2 rounded-lg bg-mondy-red px-4 py-2 font-sans text-xs font-semibold text-white shadow-sm transition hover:bg-mondy-red-dark"
        >
          <Printer className="h-3.5 w-3.5" />
          Print receipt
        </button>
      </div>

      {/* The receipt itself — narrow, monospace-feeling, B&W friendly */}
      <article
        className="mx-auto max-w-[320px] bg-white p-6 font-sans text-[12px] leading-relaxed text-black shadow-md ring-1 ring-mondy-border print:max-w-none print:shadow-none print:ring-0"
        id="printable-receipt"
      >
        {/* Header */}
        <header className="text-center">
          <div className="mx-auto mb-2 grid h-14 w-14 place-items-center">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={settings.name}
                width={56}
                height={56}
                className="h-14 w-14 object-contain"
              />
            ) : (
              <MondysEmblem size={48} className="text-mondy-red print:text-black" />
            )}
          </div>
          <h1 className="font-display text-xl font-bold uppercase tracking-wide">
            {settings.name}
          </h1>
          {settings.address && (
            <p className="mt-0.5 text-[11px]">{settings.address}</p>
          )}
          {(settings.phone || settings.email) && (
            <p className="mt-0.5 text-[11px]">
              {[settings.phone, settings.email].filter(Boolean).join(" · ")}
            </p>
          )}
        </header>

        <Divider />

        {/* Order meta */}
        <section className="space-y-0.5 text-[11px]">
          <Line label="Order" value={`#${order.orderNumber}`} bold />
          <Line label="Date" value={formatDateTime(order.createdAt)} />
          <Line
            label="Type"
            value={
              order.orderType === "DINE_IN"
                ? "Dine in"
                : order.orderType === "DELIVERY"
                  ? "Delivery"
                  : "Takeout"
            }
          />
          {order.tableNumber != null && (
            <Line label="Table" value={String(order.tableNumber)} />
          )}
          {order.customerName && (
            <Line label="Customer" value={order.customerName} />
          )}
          {order.orderType === "DELIVERY" && order.customerPhone && (
            <Line label="Phone" value={order.customerPhone} />
          )}
          {order.orderType === "DELIVERY" && order.deliveryAddress && (
            <div className="mt-1 border-t border-dashed border-black/30 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider">
                Deliver to
              </p>
              <p className="mt-0.5 text-[11px] leading-snug">
                {order.deliveryAddress}
              </p>
              {order.deliveryNotes && (
                <p className="mt-0.5 text-[10px] italic">
                  Notes: {order.deliveryNotes}
                </p>
              )}
            </div>
          )}
          <Line label="Server" value={order.staffName} />
          {order.status === "VOIDED" && (
            <Line label="STATUS" value="VOIDED" bold />
          )}
        </section>

        <Divider />

        {/* Items */}
        <section className="space-y-1.5">
          {order.items.map((item) => (
            <div key={item.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[11px] font-bold">
                  {item.quantity} ×
                </span>
                <span className="flex-1 font-medium">{item.name}</span>
                <span className="font-mono tabular">
                  {formatMoney(item.lineTotal)}
                </span>
              </div>
              {item.notes && (
                <p className="ml-6 text-[10px] italic text-gray-600">
                  {item.notes}
                </p>
              )}
              {item.quantity > 1 && (
                <p className="ml-6 text-[10px] tabular text-gray-600">
                  @ {formatMoney(item.unitPrice)} each
                </p>
              )}
            </div>
          ))}
        </section>

        <Divider />

        {/* Totals */}
        <section className="space-y-0.5">
          <Line label="Subtotal" value={formatMoney(order.subtotal)} />
          {order.discounts.length > 0 && (
            <>
              {order.discounts.map((d) => (
                <Line
                  key={d.id}
                  label={`Discount: ${d.discountName}`}
                  value={`-${formatMoney(d.amountApplied)}`}
                  small
                />
              ))}
            </>
          )}
          {order.discountAmount > 0 && order.discounts.length === 0 && (
            <Line label="Discount" value={`-${formatMoney(order.discountAmount)}`} />
          )}
          <Line
            label={`Tax (${(settings.taxRate * 100).toFixed(2)}%)`}
            value={formatMoney(order.taxAmount)}
          />
          {order.deliveryFee > 0 && (
            <Line
              label="Delivery fee"
              value={formatMoney(order.deliveryFee)}
            />
          )}
          {order.tipAmount > 0 && (
            <Line label="Tip" value={formatMoney(order.tipAmount)} />
          )}
          <div className="my-1 border-t border-dashed border-black/40" />
          <Line label="TOTAL" value={formatMoney(order.total)} bold large />
        </section>

        <Divider />

        {/* Payment */}
        <section className="space-y-1">
          {order.payments.map((p) => (
            <div key={p.id} className="space-y-0.5">
              <Line label={paymentLabel(p.method)} value={formatMoney(p.amount)} bold />
              {p.method === "CASH" && p.tendered != null && (
                <>
                  <Line label="Tendered" value={formatMoney(p.tendered)} small />
                  <Line label="Change" value={formatMoney(p.changeGiven ?? 0)} small />
                </>
              )}
              {p.cardLast4 && (
                <Line
                  label={`${p.cardBrand ?? "Card"} ****${p.cardLast4}`}
                  value=""
                  small
                />
              )}
              {p.status === "REFUNDED" && (
                <Line label="STATUS" value="REFUNDED" small bold />
              )}
            </div>
          ))}
        </section>

        <Divider />

        {/* Footer */}
        <footer className="text-center text-[10px] leading-snug text-gray-700">
          <p>{settings.receiptFooter}</p>
          <p className="mt-2 text-[9px] uppercase tracking-widest text-gray-500">
            Order #{order.orderNumber} ·{" "}
            {formatDateTime(order.createdAt, { dateOnly: true })}
          </p>
        </footer>
      </article>

      {/* Print-specific CSS — hide everything except the receipt, tweak widths */}
      <style>{`
        @media print {
          body { background: white; }
          @page { size: 80mm auto; margin: 4mm; }
          #printable-receipt {
            box-shadow: none;
            ring: 0;
            border: 0;
            max-width: 100%;
            padding: 0;
          }
        }
      `}</style>
    </main>
  );
}

function Divider() {
  return <div className="my-3 border-t border-dashed border-black/60" />;
}

function Line({
  label,
  value,
  bold,
  large,
  small,
}: {
  label: string;
  value: string;
  bold?: boolean;
  large?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2 ${
        large ? "text-base" : small ? "text-[10px]" : "text-[11px]"
      }`}
    >
      <span className={bold ? "font-bold uppercase" : ""}>{label}</span>
      {value && (
        <span className={`font-mono tabular ${bold ? "font-bold" : ""}`}>
          {value}
        </span>
      )}
    </div>
  );
}

function formatDateTime(
  d: Date | string,
  opts?: { dateOnly?: boolean },
): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (opts?.dateOnly) {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}