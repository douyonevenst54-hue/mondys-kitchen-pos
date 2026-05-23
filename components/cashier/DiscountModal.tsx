"use client";

import { useEffect, useState, useTransition } from "react";
import { Tag, Percent, DollarSign, Gift, X } from "lucide-react";
import { useCart, type AppliedDiscount } from "./CartContext";
import { formatMoney } from "@/lib/money";
import {
  getActiveDiscounts,
  verifyManagerPin,
  type ActiveDiscount,
} from "@/app/api/discounts/actions";

type Props = {
  staffId: string;
  staffRole: string;
  subtotal: number;
  onClose: () => void;
};

type Mode = "list" | "custom-percent" | "custom-amount" | "comp" | "manager-gate";

export function DiscountModal({ staffId, staffRole, subtotal, onClose }: Props) {
  const { applyDiscount } = useCart();
  const [presets, setPresets] = useState<ActiveDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("list");
  const [pendingDiscount, setPendingDiscount] =
    useState<AppliedDiscount | null>(null);
  const [customValue, setCustomValue] = useState("");
  const [compReason, setCompReason] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canApplyComp = staffRole === "OWNER" || staffRole === "MANAGER";

  useEffect(() => {
    let cancelled = false;
    getActiveDiscounts()
      .then((rows) => {
        if (!cancelled) {
          setPresets(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handlePresetClick(p: ActiveDiscount) {
    const built: AppliedDiscount = {
      id: p.id,
      code: p.code,
      name: p.name,
      type: p.type,
      value: p.value,
      appliedByStaffId: staffId,
    };
    if (p.requiresManager && !canApplyComp) {
      setPendingDiscount(built);
      setMode("manager-gate");
      return;
    }
    applyDiscount(built);
    onClose();
  }

  function handleCustomSubmit(type: "PERCENT" | "FIXED_AMOUNT") {
    const num = parseFloat(customValue);
    if (!num || num <= 0) {
      setError("Enter a positive number");
      return;
    }
    if (type === "PERCENT" && num > 100) {
      setError("Percent must be ≤ 100");
      return;
    }
    applyDiscount({
      id: `custom-${type}-${Date.now()}`,
      code: type === "PERCENT" ? `CUSTOM-${num}PCT` : `CUSTOM-$${num}`,
      name: type === "PERCENT" ? `${num}% off` : `${formatMoney(num)} off`,
      type,
      value: num,
      appliedByStaffId: staffId,
    });
    onClose();
  }

  function handleCompSubmit() {
    const num = parseFloat(customValue);
    if (!num || num <= 0) {
      setError("Enter a positive comp amount");
      return;
    }
    if (!compReason.trim()) {
      setError("Reason required for comp");
      return;
    }
    const built: AppliedDiscount = {
      id: `comp-${Date.now()}`,
      code: "COMP",
      name: "Comp",
      type: "COMP",
      value: Math.min(num, subtotal),
      appliedByStaffId: staffId,
      reason: compReason.trim(),
    };
    if (!canApplyComp) {
      setPendingDiscount(built);
      setMode("manager-gate");
      return;
    }
    applyDiscount(built);
    onClose();
  }

  function handleManagerVerify() {
    if (!pendingDiscount) return;
    setError(null);
    startTransition(async () => {
      const result = await verifyManagerPin(managerPin);
      if (!result.ok) {
        setError(result.error);
        setManagerPin("");
        return;
      }
      applyDiscount({
        ...pendingDiscount,
        appliedByStaffId: result.staffId,
      });
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-mondy-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-5 flex items-start justify-between">
          <div>
            <p className="font-sans text-[11px] uppercase tracking-[0.24em] text-mondy-red-dark">
              Apply Discount
            </p>
            <h3 className="mt-1 font-display text-2xl font-bold text-mondy-ink">
              {mode === "list" && "Choose a discount"}
              {mode === "custom-percent" && "Custom % off"}
              {mode === "custom-amount" && "Custom $ off"}
              {mode === "comp" && "Manager comp"}
              {mode === "manager-gate" && "Manager approval"}
            </h3>
            <p className="mt-1 font-sans text-sm text-mondy-muted tabular">
              Order subtotal: {formatMoney(subtotal)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg text-mondy-muted hover:bg-mondy-cream hover:text-mondy-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {mode === "list" && (
          <div className="space-y-3">
            {/* Preset discounts */}
            {loading ? (
              <p className="font-sans text-sm text-mondy-muted">Loading…</p>
            ) : presets.length === 0 ? (
              <p className="font-sans text-sm text-mondy-muted">
                No preset discounts configured. Use a custom option below.
              </p>
            ) : (
              <ul className="space-y-2">
                {presets.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handlePresetClick(p)}
                      className="flex w-full items-center justify-between rounded-xl bg-mondy-cream px-4 py-3 ring-1 ring-mondy-border transition hover:bg-white hover:ring-mondy-red/40"
                    >
                      <span className="flex items-center gap-3">
                        <Tag className="h-4 w-4 text-mondy-red" />
                        <span className="font-display text-sm font-semibold text-mondy-ink">
                          {p.name}
                        </span>
                      </span>
                      <span className="font-sans text-xs font-medium text-mondy-muted">
                        {p.type === "PERCENT"
                          ? `${p.value}%`
                          : p.type === "FIXED_AMOUNT"
                            ? formatMoney(p.value)
                            : "Comp"}
                        {p.requiresManager && (
                          <span className="ml-2 rounded-full bg-mondy-yellow-soft px-2 py-0.5 text-[10px] uppercase tracking-wider text-mondy-red-dark">
                            Mgr
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="my-2 h-px bg-mondy-border" />

            <div className="grid grid-cols-3 gap-2">
              <ModeButton
                icon={<Percent className="h-4 w-4" />}
                label="% off"
                onClick={() => {
                  setError(null);
                  setCustomValue("");
                  setMode("custom-percent");
                }}
              />
              <ModeButton
                icon={<DollarSign className="h-4 w-4" />}
                label="$ off"
                onClick={() => {
                  setError(null);
                  setCustomValue("");
                  setMode("custom-amount");
                }}
              />
              <ModeButton
                icon={<Gift className="h-4 w-4" />}
                label="Comp"
                onClick={() => {
                  setError(null);
                  setCustomValue("");
                  setCompReason("");
                  setMode("comp");
                }}
              />
            </div>
          </div>
        )}

        {(mode === "custom-percent" || mode === "custom-amount") && (
          <div className="space-y-3">
            <NumericInput
              prefix={mode === "custom-amount" ? "$" : undefined}
              suffix={mode === "custom-percent" ? "%" : undefined}
              value={customValue}
              onChange={(v) => {
                setError(null);
                setCustomValue(v);
              }}
              placeholder={mode === "custom-percent" ? "10" : "5.00"}
            />
            {error && (
              <p className="font-sans text-xs text-mondy-red-dark">{error}</p>
            )}
            <ModalActions
              onBack={() => setMode("list")}
              onConfirm={() =>
                handleCustomSubmit(
                  mode === "custom-percent" ? "PERCENT" : "FIXED_AMOUNT",
                )
              }
              confirmLabel="Apply discount"
            />
          </div>
        )}

        {mode === "comp" && (
          <div className="space-y-3">
            <NumericInput
              prefix="$"
              value={customValue}
              onChange={(v) => {
                setError(null);
                setCustomValue(v);
              }}
              placeholder={subtotal.toFixed(2)}
            />
            <textarea
              value={compReason}
              onChange={(e) => {
                setError(null);
                setCompReason(e.target.value);
              }}
              placeholder="Reason (e.g. wrong order, complaint)"
              rows={2}
              className="w-full resize-none rounded-xl border border-mondy-border bg-white px-3 py-2 font-sans text-sm text-mondy-ink placeholder:text-mondy-muted focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
            />
            {error && (
              <p className="font-sans text-xs text-mondy-red-dark">{error}</p>
            )}
            {!canApplyComp && (
              <p className="rounded-lg bg-mondy-yellow-soft/40 px-3 py-2 font-sans text-xs text-mondy-ink ring-1 ring-mondy-yellow-deep/30">
                A manager will need to approve this comp.
              </p>
            )}
            <ModalActions
              onBack={() => setMode("list")}
              onConfirm={handleCompSubmit}
              confirmLabel={canApplyComp ? "Apply comp" : "Request approval"}
            />
          </div>
        )}

        {mode === "manager-gate" && (
          <div className="space-y-3">
            <p className="font-sans text-sm text-mondy-muted">
              Enter a manager or owner PIN to authorize this discount.
            </p>
            <input
              type="password"
              inputMode="numeric"
              value={managerPin}
              onChange={(e) => {
                setError(null);
                setManagerPin(e.target.value.replace(/\D/g, "").slice(0, 8));
              }}
              placeholder="Manager PIN"
              className="h-12 w-full rounded-xl border border-mondy-border bg-white px-4 text-center font-display text-xl tracking-[0.4em] text-mondy-ink focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
              autoFocus
            />
            {error && (
              <p className="font-sans text-xs text-mondy-red-dark">{error}</p>
            )}
            <ModalActions
              onBack={() => {
                setManagerPin("");
                setError(null);
                setMode("list");
              }}
              onConfirm={handleManagerVerify}
              confirmLabel={isPending ? "Verifying…" : "Authorize"}
              confirmDisabled={isPending || managerPin.length < 4}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ModeButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-mondy-cream py-3 ring-1 ring-mondy-border transition hover:bg-white hover:ring-mondy-red/40"
    >
      <span className="text-mondy-red">{icon}</span>
      <span className="font-display text-xs font-semibold text-mondy-ink">
        {label}
      </span>
    </button>
  );
}

function NumericInput({
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-display text-xl text-mondy-muted">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder}
        autoFocus
        className={`h-14 w-full rounded-xl border border-mondy-border bg-white text-center font-display text-2xl font-bold tabular text-mondy-ink placeholder:text-mondy-muted focus:outline-none focus:ring-2 focus:ring-mondy-red/40 ${prefix ? "pl-10" : ""} ${suffix ? "pr-10" : ""}`}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-display text-xl text-mondy-muted">
          {suffix}
        </span>
      )}
    </div>
  );
}

function ModalActions({
  onBack,
  onConfirm,
  confirmLabel,
  confirmDisabled,
}: {
  onBack: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onBack}
        className="rounded-xl border border-mondy-border bg-white px-4 py-3 font-sans text-sm font-medium text-mondy-ink transition hover:bg-mondy-cream"
      >
        Back
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirmDisabled}
        className="flex-1 rounded-xl bg-mondy-red px-4 py-3 font-display text-sm font-semibold text-white shadow-sm transition hover:bg-mondy-red-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-mondy-muted/40 disabled:shadow-none"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
