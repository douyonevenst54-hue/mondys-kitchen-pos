"use client";

import { useState, useTransition } from "react";
import {
  Banknote,
  CreditCard,
  Smartphone,
  X,
  CheckCircle2,
} from "lucide-react";
import { useCart } from "./CartContext";
import { formatMoney } from "@/lib/money";
import { submitCheckout } from "@/app/api/orders/actions";

type Props = {
  staffId: string;
  taxRate: number;
  onClose: () => void;
  onComplete: () => void;
};

type Method =
  | "CASH"
  | "CARD_PRESENT"
  | "CARD_MANUAL"
  | "MOBILE_WALLET"
  | "CASH_APP"
  | "OTHER";

type Step = "method" | "cash-tendered" | "card-confirm" | "success";

const QUICK_TENDER_AMOUNTS = [5, 10, 20, 50, 100];

export function CheckoutModal({ staffId, taxRate, onClose, onComplete }: Props) {
  const {
    state,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    clear,
  } = useCart();

  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<Method | null>(null);
  const [tendered, setTendered] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const tenderedNum = parseFloat(tendered) || 0;
  const changeAmount = Math.max(0, Math.round((tenderedNum - total) * 100) / 100);

  function pickMethod(m: Method) {
    setMethod(m);
    setError(null);
    if (m === "CASH") {
      setStep("cash-tendered");
    } else {
      setStep("card-confirm");
    }
  }

  function submitOrder(paymentDetails: {
    method: Method;
    tendered: number | null;
    changeGiven: number | null;
  }) {
    setError(null);
    startTransition(async () => {
      const result = await submitCheckout({
        orderType: state.orderType,
        tableId: state.tableId,
        customerName: state.customerName,
        staffId,
        lines: state.lines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          nameSnapshot: l.name,
          spiceLevel: l.spiceLevel ?? null,
        })),
        discount: state.discount
          ? {
              id: state.discount.id,
              code: state.discount.code,
              name: state.discount.name,
              type: state.discount.type,
              value: state.discount.value,
              amountApplied: discountAmount,
              appliedByStaffId: state.discount.appliedByStaffId,
              reason: state.discount.reason ?? null,
            }
          : null,
        subtotal,
        discountAmount,
        taxAmount,
        total,
        taxRate,
        payment: {
          method: paymentDetails.method,
          amount: total,
          tendered: paymentDetails.tendered,
          changeGiven: paymentDetails.changeGiven,
        },
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOrderNumber(result.orderNumber);
      setStep("success");
    });
  }

  function handleCashConfirm() {
    if (tenderedNum < total) {
      setError(`Tendered amount must be at least ${formatMoney(total)}`);
      return;
    }
    submitOrder({
      method: "CASH",
      tendered: tenderedNum,
      changeGiven: changeAmount,
    });
  }

  function handleCardConfirm() {
    if (!method) return;
    submitOrder({
      method,
      tendered: null,
      changeGiven: null,
    });
  }

  function handleDone() {
    clear();
    onComplete();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-mondy-ink/50 p-4 backdrop-blur-sm"
      onClick={step === "success" ? undefined : onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {step !== "success" && (
          <header className="flex items-start justify-between border-b border-mondy-border px-6 py-5">
            <div>
              <p className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-red-dark">
                Checkout
              </p>
              <h3 className="mt-1 font-display text-3xl font-bold text-mondy-ink tabular">
                {formatMoney(total)}
              </h3>
              <div className="mt-1 flex items-center gap-3 font-sans text-xs text-mondy-muted">
                <span>Subtotal {formatMoney(subtotal)}</span>
                {discountAmount > 0 && (
                  <span className="text-mondy-red">
                    −{formatMoney(discountAmount)}
                  </span>
                )}
                <span>Tax {formatMoney(taxAmount)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-lg text-mondy-muted hover:bg-mondy-cream hover:text-mondy-ink"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
        )}

        {/* Method selection */}
        {step === "method" && (
          <div className="p-6">
            <p className="mb-4 font-sans text-sm text-mondy-muted">
              How is the customer paying?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <MethodButton
                icon={<Banknote className="h-6 w-6" />}
                label="Cash"
                onClick={() => pickMethod("CASH")}
              />
              <MethodButton
                icon={<CreditCard className="h-6 w-6" />}
                label="Card (chip/tap)"
                onClick={() => pickMethod("CARD_PRESENT")}
              />
              <MethodButton
                icon={<Smartphone className="h-6 w-6" />}
                label="Mobile wallet"
                sublabel="Apple/Google Pay"
                onClick={() => pickMethod("MOBILE_WALLET")}
              />
              <MethodButton
                icon={<CreditCard className="h-6 w-6 opacity-70" />}
                label="Card (manual)"
                sublabel="Keyed in"
                onClick={() => pickMethod("CARD_MANUAL")}
              />
              <MethodButton
                icon={<Smartphone className="h-6 w-6 opacity-70" />}
                label="Cash App / Zelle"
                onClick={() => pickMethod("CASH_APP")}
              />
              <MethodButton
                icon={<CreditCard className="h-6 w-6 opacity-50" />}
                label="Other"
                onClick={() => pickMethod("OTHER")}
              />
            </div>
          </div>
        )}

        {/* Cash tendered */}
        {step === "cash-tendered" && (
          <div className="p-6">
            <p className="mb-3 font-sans text-sm text-mondy-muted">
              Amount tendered
            </p>
            <input
              type="text"
              inputMode="decimal"
              value={tendered}
              onChange={(e) => {
                setError(null);
                setTendered(e.target.value.replace(/[^0-9.]/g, ""));
              }}
              placeholder={total.toFixed(2)}
              autoFocus
              className="h-16 w-full rounded-xl border border-mondy-border bg-white px-4 text-center font-display text-3xl font-bold tabular text-mondy-ink placeholder:text-mondy-muted focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
            />

            <div className="mt-3 grid grid-cols-5 gap-2">
              {QUICK_TENDER_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setError(null);
                    setTendered(amt.toFixed(2));
                  }}
                  className="rounded-lg bg-mondy-cream py-2 font-display text-sm font-semibold text-mondy-ink ring-1 ring-mondy-border transition hover:bg-white"
                >
                  ${amt}
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-xl bg-mondy-cream p-4">
              <div className="flex items-center justify-between font-sans text-sm">
                <span className="text-mondy-muted">Due</span>
                <span className="tabular text-mondy-ink">
                  {formatMoney(total)}
                </span>
              </div>
              <div className="my-2 h-px bg-mondy-border" />
              <div className="flex items-center justify-between">
                <span className="font-display text-base font-semibold text-mondy-ink">
                  Change
                </span>
                <span className="font-display text-2xl font-bold text-mondy-red tabular">
                  {formatMoney(changeAmount)}
                </span>
              </div>
            </div>

            {error && (
              <p className="mt-3 font-sans text-xs text-mondy-red-dark">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setStep("method")}
                className="rounded-xl border border-mondy-border bg-white px-4 py-3 font-sans text-sm font-medium text-mondy-ink hover:bg-mondy-cream"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCashConfirm}
                disabled={isPending || tenderedNum < total}
                className="flex-1 rounded-xl bg-mondy-red px-4 py-3 font-display text-base font-semibold text-white shadow-sm hover:bg-mondy-red-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-mondy-muted/40 disabled:shadow-none"
              >
                {isPending ? "Recording…" : "Complete order"}
              </button>
            </div>
          </div>
        )}

        {/* Card confirm */}
        {step === "card-confirm" && (
          <div className="p-6">
            <div className="rounded-xl bg-mondy-yellow-soft/40 p-4 ring-1 ring-mondy-yellow-deep/30">
              <p className="font-display text-base text-mondy-ink">
                Run the card on the terminal, then confirm here.
              </p>
              <p className="mt-1 font-sans text-xs text-mondy-muted">
                Future Phase: Epos Now integration will auto-fill this step.
              </p>
            </div>

            {error && (
              <p className="mt-3 font-sans text-xs text-mondy-red-dark">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setStep("method")}
                className="rounded-xl border border-mondy-border bg-white px-4 py-3 font-sans text-sm font-medium text-mondy-ink hover:bg-mondy-cream"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCardConfirm}
                disabled={isPending}
                className="flex-1 rounded-xl bg-mondy-red px-4 py-3 font-display text-base font-semibold text-white shadow-sm hover:bg-mondy-red-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-mondy-muted/40 disabled:shadow-none"
              >
                {isPending ? "Recording…" : `Confirm ${formatMoney(total)} paid`}
              </button>
            </div>
          </div>
        )}

        {/* Success */}
        {step === "success" && (
          <div className="p-8 text-center">
            <div
              aria-hidden
              className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-mondy-red/10"
            >
              <CheckCircle2 className="h-10 w-10 text-mondy-red" />
            </div>
            <p className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-red-dark">
              Order Complete
            </p>
            <h3 className="mt-2 font-display text-4xl font-black text-mondy-ink tabular">
              #{orderNumber}
            </h3>
            <p className="mt-2 font-sans text-sm text-mondy-muted">
              {formatMoney(total)} via {method?.replace(/_/g, " ").toLowerCase()}
              {method === "CASH" &&
                changeAmount > 0 &&
                ` · ${formatMoney(changeAmount)} change`}
            </p>

            <button
              type="button"
              onClick={handleDone}
              className="mt-6 w-full rounded-xl bg-mondy-red px-4 py-3 font-display text-base font-semibold text-white shadow-sm hover:bg-mondy-red-dark"
              autoFocus
            >
              Start new order
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MethodButton({
  icon,
  label,
  sublabel,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-mondy-cream py-5 ring-1 ring-mondy-border transition-all duration-200 ease-mondy hover:-translate-y-0.5 hover:bg-white hover:shadow-md hover:ring-mondy-red/40 active:scale-[0.97]"
    >
      <span className="text-mondy-red">{icon}</span>
      <span className="font-display text-sm font-semibold text-mondy-ink">
        {label}
      </span>
      {sublabel && (
        <span className="font-sans text-[10px] text-mondy-muted">
          {sublabel}
        </span>
      )}
    </button>
  );
}
