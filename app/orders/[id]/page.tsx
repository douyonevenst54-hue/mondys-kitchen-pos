import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { Utensils, ShoppingBag, Truck, Ban, Tag, CheckCircle2 } from "lucide-react";
import { getOrderDetail } from "@/lib/orders";
import { OrdersPageHeader } from "@/components/orders/OrdersPageHeader";
import { OrderDetailActions } from "@/components/orders/OrderDetailActions";
import { formatMoney } from "@/lib/money";
import { paymentLabel } from "@/components/orders/StatsSummary";

type Session = { staffId: string; name: string; role: string };

async function getSession(): Promise<Session | null> {
  const c = await cookies();
  const raw = c.get("mondy_session")?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

type Params = Promise<{ id: string }>;

export default async function OrderDetailPage({
  params,
}: {
  params: Params;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const order = await getOrderDetail(id);
  if (!order) notFound();

  const voided = order.status === "VOIDED";

  return (
    <main className="min-h-screen bg-mondy-cream">
      <OrdersPageHeader
        title={`Order #${order.orderNumber}`}
        subtitle="Order Details"
        backHref="/orders"
        backLabel="All orders"
      />

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-5 sm:px-6 sm:py-6">
        {/* Action buttons */}
        <OrderDetailActions
          orderId={order.id}
          orderNumber={order.orderNumber}
          orderTotal={order.total}
          canVoid={!voided}
        />

        {/* Status & meta header */}
        <section className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {order.orderType === "DINE_IN" ? (
                <span
                  aria-hidden
                  className="grid h-11 w-11 place-items-center rounded-xl bg-mondy-yellow-soft text-mondy-red-dark"
                >
                  <Utensils className="h-5 w-5" />
                </span>
              ) : order.orderType === "DELIVERY" ? (
                <span
                  aria-hidden
                  className="grid h-11 w-11 place-items-center rounded-xl bg-mondy-red/10 text-mondy-red-dark ring-1 ring-mondy-red/20"
                >
                  <Truck className="h-5 w-5" />
                </span>
              ) : (
                <span
                  aria-hidden
                  className="grid h-11 w-11 place-items-center rounded-xl bg-mondy-cream text-mondy-ink ring-1 ring-mondy-border"
                >
                  <ShoppingBag className="h-5 w-5" />
                </span>
              )}
              <div>
                <p className="font-sans text-[11px] uppercase tracking-[0.22em] text-mondy-red-dark">
                  {order.orderType === "DINE_IN"
                    ? "Dine in"
                    : order.orderType === "DELIVERY"
                      ? "Delivery"
                      : "Takeout"}
                </p>
                <p className="font-display text-base font-semibold text-mondy-ink">
                  {order.orderType === "DINE_IN"
                    ? order.tableNumber
                      ? `Table ${order.tableNumber}`
                      : "Counter"
                    : order.customerName ?? "Counter"}
                </p>
                <p className="font-sans text-xs text-mondy-muted">
                  Rung up by {order.staffName} · {formatDateTime(order.createdAt)}
                </p>
              </div>
            </div>

            <StatusBadge status={order.status} />
          </div>

          {order.orderType === "DELIVERY" && order.deliveryAddress && (
            <div className="mt-3 space-y-1.5 rounded-lg bg-mondy-red/5 px-3 py-2.5 ring-1 ring-mondy-red/15">
              <p className="font-sans text-[10px] uppercase tracking-widest text-mondy-red-dark">
                Deliver to
              </p>
              <p className="font-display text-sm font-semibold text-mondy-ink">
                {order.customerName ?? "Customer"}
                {order.customerPhone && (
                  <span className="ml-2 font-sans text-xs font-medium text-mondy-muted tabular">
                    {order.customerPhone}
                  </span>
                )}
              </p>
              <p className="font-sans text-sm text-mondy-ink">
                {order.deliveryAddress}
              </p>
              {order.deliveryNotes && (
                <p className="font-sans text-xs italic text-mondy-muted">
                  Notes: {order.deliveryNotes}
                </p>
              )}
            </div>
          )}

          {voided && order.voidedReason && (
            <div className="mt-3 rounded-lg bg-mondy-red/5 px-3 py-2 ring-1 ring-mondy-red/20">
              <p className="font-sans text-[10px] uppercase tracking-widest text-mondy-red-dark">
                Void reason
              </p>
              <p className="mt-0.5 font-sans text-sm text-mondy-ink">
                {order.voidedReason}
              </p>
              {order.voidedAt && (
                <p className="mt-1 font-sans text-[11px] text-mondy-muted">
                  {formatDateTime(order.voidedAt)}
                </p>
              )}
            </div>
          )}

          {order.notes && (
            <div className="mt-3 rounded-lg bg-mondy-cream px-3 py-2">
              <p className="font-sans text-[10px] uppercase tracking-widest text-mondy-muted">
                Order notes
              </p>
              <p className="mt-0.5 font-sans text-sm text-mondy-ink">
                {order.notes}
              </p>
            </div>
          )}
        </section>

        {/* Items */}
        <section className="rounded-2xl bg-white ring-1 ring-mondy-border">
          <header className="border-b border-mondy-border px-5 py-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-mondy-muted">
              Items
            </h2>
          </header>
          <ul className="divide-y divide-mondy-border">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-mondy-cream font-sans text-sm font-semibold text-mondy-ink tabular">
                  {item.quantity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-semibold text-mondy-ink">
                    {item.name}
                  </p>
                  {item.notes && (
                    <p className="mt-0.5 font-sans text-xs text-mondy-muted">
                      {item.notes}
                    </p>
                  )}
                  <p className="mt-0.5 font-sans text-[11px] text-mondy-muted tabular">
                    {formatMoney(item.unitPrice)} each
                  </p>
                </div>
                <p className="font-display text-sm font-bold text-mondy-ink tabular">
                  {formatMoney(item.lineTotal)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Discounts */}
        {order.discounts.length > 0 && (
          <section className="rounded-2xl bg-white ring-1 ring-mondy-border">
            <header className="border-b border-mondy-border px-5 py-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-mondy-muted">
                Discounts applied
              </h2>
            </header>
            <ul className="divide-y divide-mondy-border">
              {order.discounts.map((d) => (
                <li key={d.id} className="flex items-start gap-3 px-5 py-3">
                  <Tag className="mt-0.5 h-4 w-4 shrink-0 text-mondy-red" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm font-semibold text-mondy-ink">
                      {d.discountName}
                    </p>
                    {d.reason && (
                      <p className="mt-0.5 font-sans text-xs text-mondy-muted">
                        {d.reason}
                      </p>
                    )}
                    <p className="mt-0.5 font-sans text-[11px] text-mondy-muted">
                      Applied by {d.appliedByStaffName}
                    </p>
                  </div>
                  <p className="font-display text-sm font-bold text-mondy-red tabular">
                    −{formatMoney(d.amountApplied)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Totals */}
        <section className="rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
          <dl className="space-y-2">
            <Row label="Subtotal" value={formatMoney(order.subtotal)} />
            {order.discountAmount > 0 && (
              <Row
                label="Discount"
                value={`−${formatMoney(order.discountAmount)}`}
                tone="discount"
              />
            )}
            <Row label="Tax" value={formatMoney(order.taxAmount)} />
            {order.deliveryFee > 0 && (
              <Row label="Delivery fee" value={formatMoney(order.deliveryFee)} />
            )}
            {order.tipAmount > 0 && (
              <Row label="Tip" value={formatMoney(order.tipAmount)} />
            )}
            <div className="my-2 h-px bg-mondy-border" />
            <Row label="Total" value={formatMoney(order.total)} emphasis />
          </dl>
        </section>

        {/* Payments */}
        <section className="rounded-2xl bg-white ring-1 ring-mondy-border">
          <header className="border-b border-mondy-border px-5 py-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-mondy-muted">
              Payment{order.payments.length > 1 ? "s" : ""}
            </h2>
          </header>
          <ul className="divide-y divide-mondy-border">
            {order.payments.map((p) => (
              <li key={p.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm font-semibold text-mondy-ink">
                      {paymentLabel(p.method)}
                    </p>
                    <p className="mt-0.5 font-sans text-xs text-mondy-muted">
                      {formatDateTime(p.processedAt)}
                    </p>
                    {p.method === "CASH" && p.tendered != null && (
                      <p className="mt-1 font-sans text-xs text-mondy-muted tabular">
                        Tendered {formatMoney(p.tendered)} · Change{" "}
                        {formatMoney(p.changeGiven ?? 0)}
                      </p>
                    )}
                    {p.cardLast4 && (
                      <p className="mt-1 font-sans text-xs text-mondy-muted">
                        {p.cardBrand ?? "Card"} •••• {p.cardLast4}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-display text-base font-bold text-mondy-ink tabular">
                      {formatMoney(p.amount)}
                    </p>
                    {p.status === "COMPLETED" && (
                      <span className="mt-0.5 inline-flex items-center gap-1 font-sans text-[10px] uppercase tracking-wider text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Completed
                      </span>
                    )}
                    {p.status === "REFUNDED" && (
                      <span className="mt-0.5 inline-flex items-center gap-1 font-sans text-[10px] uppercase tracking-wider text-mondy-red-dark">
                        Refunded
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "VOIDED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-mondy-red/10 px-2.5 py-1 font-sans text-[11px] font-bold uppercase tracking-wider text-mondy-red-dark">
        <Ban className="h-3 w-3" />
        Voided
      </span>
    );
  }
  if (status === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 font-sans text-[11px] font-bold uppercase tracking-wider text-emerald-800">
        <CheckCircle2 className="h-3 w-3" />
        Completed
      </span>
    );
  }
  return (
    <span className="rounded-full bg-mondy-cream px-2.5 py-1 font-sans text-[11px] font-bold uppercase tracking-wider text-mondy-ink ring-1 ring-mondy-border">
      {status.toLowerCase()}
    </span>
  );
}

function Row({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "discount";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt
        className={
          emphasis
            ? "font-display text-base font-semibold text-mondy-ink"
            : "font-sans text-sm text-mondy-muted"
        }
      >
        {label}
      </dt>
      <dd
        className={`tabular ${
          emphasis
            ? "font-display text-2xl font-bold text-mondy-red"
            : tone === "discount"
              ? "font-sans text-sm font-semibold text-mondy-red"
              : "font-sans text-sm font-medium text-mondy-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}