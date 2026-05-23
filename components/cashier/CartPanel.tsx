"use client";

import { useState } from "react";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  Users,
  Utensils,
  Flame,
  Tag,
  X,
} from "lucide-react";
import { useCart } from "./CartContext";
import { formatMoney } from "@/lib/money";
import { DiscountModal } from "./DiscountModal";

type Table = {
  id: string;
  number: number;
  label: string | null;
  capacity: number;
  status: string;
};

type Props = {
  tables: Table[];
  taxRate: number;
  staffId: string;
  staffRole: string;
  onCheckout: () => void;
};

export function CartPanel({ tables, taxRate, staffId, staffRole, onCheckout }: Props) {
  const {
    state,
    itemCount,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    increment,
    decrement,
    removeLine,
    clear,
    setOrderType,
    setTable,
    setCustomerName,
    removeDiscount,
  } = useCart();
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);

  const empty = state.lines.length === 0;
  const selectedTable =
    state.tableId != null
      ? tables.find((t) => t.id === state.tableId)
      : null;

  return (
    <aside className="flex h-full w-full flex-col border-l border-mondy-border bg-white lg:w-[380px] xl:w-[420px]">
      {/* Header */}
      <div className="border-b border-mondy-border px-4 pb-3 pt-4 sm:px-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-mondy-ink">
            Current Order
          </h2>
          <span className="font-sans text-[11px] uppercase tracking-widest text-mondy-muted tabular">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        </div>

        {/* Order type toggle */}
        <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl bg-mondy-cream p-1 ring-1 ring-mondy-border">
          <OrderTypeButton
            active={state.orderType === "DINE_IN"}
            onClick={() => setOrderType("DINE_IN")}
            icon={<Utensils className="h-4 w-4" />}
            label="Dine In"
          />
          <OrderTypeButton
            active={state.orderType === "TAKEOUT"}
            onClick={() => setOrderType("TAKEOUT")}
            icon={<ShoppingBag className="h-4 w-4" />}
            label="Takeout"
          />
        </div>

        {/* Table picker (dine-in only) or customer name (takeout) */}
        <div className="mt-3">
          {state.orderType === "DINE_IN" ? (
            <button
              type="button"
              onClick={() => setTablePickerOpen(true)}
              className="flex w-full items-center justify-between rounded-xl border border-mondy-border bg-white px-3 py-2.5 font-sans text-sm text-mondy-ink transition hover:bg-mondy-cream"
            >
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4 text-mondy-muted" />
                {selectedTable
                  ? `Table ${selectedTable.number}${selectedTable.label ? ` — ${selectedTable.label}` : ""}`
                  : "Select a table"}
              </span>
              <span className="text-xs text-mondy-muted">Change</span>
            </button>
          ) : (
            <input
              type="text"
              value={state.customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name (e.g. Marie)"
              className="h-10 w-full rounded-xl border border-mondy-border bg-white px-3 font-sans text-sm text-mondy-ink placeholder:text-mondy-muted focus:bg-white focus:outline-none focus:ring-2 focus:ring-mondy-red/40"
            />
          )}
        </div>
      </div>

      {/* Lines */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div
              aria-hidden
              className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-mondy-cream"
            >
              <ShoppingBag className="h-6 w-6 text-mondy-muted" />
            </div>
            <p className="font-display text-base text-mondy-ink">
              No items yet
            </p>
            <p className="mt-1 font-sans text-sm text-mondy-muted">
              Tap menu items on the left to add them to this order.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-mondy-border">
            {state.lines.map((line) => (
              <li
                key={line.lineId}
                className="flex items-start gap-3 px-4 py-3 sm:px-5"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-display text-sm font-semibold text-mondy-ink line-clamp-2">
                    {line.name}
                  </p>
                  {line.spiceLevel && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-mondy-red/10 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-mondy-red">
                      <Flame className="h-2.5 w-2.5" fill="currentColor" />
                      {line.spiceLevel}
                    </span>
                  )}
                  <p className="mt-0.5 font-sans text-xs text-mondy-muted tabular">
                    {formatMoney(line.unitPrice)} each
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  <span className="font-display text-sm font-bold text-mondy-ink tabular">
                    {formatMoney(line.unitPrice * line.quantity)}
                  </span>
                  <div className="flex items-center gap-1 rounded-lg bg-mondy-cream ring-1 ring-mondy-border">
                    <button
                      type="button"
                      onClick={() => decrement(line.lineId)}
                      className="grid h-7 w-7 place-items-center rounded-md text-mondy-ink transition hover:bg-white"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center font-sans text-sm font-semibold tabular">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => increment(line.lineId)}
                      className="grid h-7 w-7 place-items-center rounded-md text-mondy-ink transition hover:bg-white"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeLine(line.lineId)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-mondy-muted transition hover:bg-mondy-red/10 hover:text-mondy-red"
                  aria-label={`Remove ${line.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Totals + actions */}
      <div className="border-t border-mondy-border bg-mondy-cream/50 px-4 pb-4 pt-3 sm:px-5">
        {/* Discount chip (if applied) or "Add discount" button */}
        {state.discount ? (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-mondy-red/5 px-3 py-2 ring-1 ring-mondy-red/20">
            <Tag className="h-3.5 w-3.5 text-mondy-red" />
            <span className="flex-1 font-sans text-xs font-medium text-mondy-ink">
              {state.discount.name}
              <span className="ml-1 text-mondy-muted">
                {state.discount.type === "PERCENT"
                  ? `(${state.discount.value}% off)`
                  : state.discount.type === "FIXED_AMOUNT"
                    ? `(${formatMoney(state.discount.value)} off)`
                    : `(comp ${formatMoney(state.discount.value)})`}
              </span>
            </span>
            <button
              type="button"
              onClick={removeDiscount}
              aria-label="Remove discount"
              className="grid h-5 w-5 place-items-center rounded text-mondy-muted hover:bg-white hover:text-mondy-red"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDiscountModalOpen(true)}
            disabled={empty}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-mondy-border bg-white/50 px-3 py-2 font-sans text-xs font-medium text-mondy-muted transition hover:border-mondy-red/40 hover:text-mondy-red disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Tag className="h-3.5 w-3.5" />
            Add discount
          </button>
        )}

        <dl className="space-y-1.5">
          <Row label="Subtotal" value={formatMoney(subtotal)} />
          {discountAmount > 0 && (
            <Row
              label="Discount"
              value={`−${formatMoney(discountAmount)}`}
              tone="discount"
            />
          )}
          <Row
            label={`Tax (${(taxRate * 100).toFixed(2)}%)`}
            value={formatMoney(taxAmount)}
          />
          <div className="my-2 h-px bg-mondy-border" />
          <Row label="Total" value={formatMoney(total)} emphasis />
        </dl>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={clear}
            disabled={empty}
            className="rounded-xl border border-mondy-border bg-white px-3 py-3 font-sans text-sm font-medium text-mondy-ink transition hover:bg-mondy-cream disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={empty || (state.orderType === "DINE_IN" && !state.tableId)}
            onClick={onCheckout}
            className="flex-1 rounded-xl bg-mondy-red px-4 py-3 font-display text-base font-semibold text-white shadow-sm transition-all duration-200 ease-mondy hover:bg-mondy-red-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-mondy-muted/40 disabled:shadow-none"
          >
            {empty
              ? "Add items to begin"
              : state.orderType === "DINE_IN" && !state.tableId
                ? "Select a table"
                : `Pay ${formatMoney(total)}`}
          </button>
        </div>
      </div>

      {/* Table picker modal */}
      {tablePickerOpen && (
        <TablePicker
          tables={tables}
          selectedId={state.tableId}
          onSelect={(id) => {
            setTable(id);
            setTablePickerOpen(false);
          }}
          onClose={() => setTablePickerOpen(false)}
        />
      )}

      {/* Discount modal */}
      {discountModalOpen && (
        <DiscountModal
          staffId={staffId}
          staffRole={staffRole}
          subtotal={subtotal}
          onClose={() => setDiscountModalOpen(false)}
        />
      )}
    </aside>
  );
}

function OrderTypeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-lg py-2 font-display text-sm font-semibold transition-all duration-200 ${
        active
          ? "bg-white text-mondy-red shadow-sm ring-1 ring-mondy-border"
          : "text-mondy-muted hover:text-mondy-ink"
      }`}
    >
      {icon}
      {label}
    </button>
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
            ? "font-display text-xl font-bold text-mondy-red"
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

function TablePicker({
  tables,
  selectedId,
  onSelect,
  onClose,
}: {
  tables: Table[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-mondy-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-bold text-mondy-ink">
            Select a Table
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1 font-sans text-sm text-mondy-muted hover:bg-mondy-cream"
          >
            Cancel
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {tables.map((t) => {
            const isSelected = t.id === selectedId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                className={`flex flex-col items-center justify-center rounded-xl px-3 py-4 transition ${
                  isSelected
                    ? "bg-mondy-red text-white shadow"
                    : "bg-mondy-cream text-mondy-ink hover:bg-mondy-yellow-soft/40"
                }`}
              >
                <span className="font-display text-2xl font-bold tabular">
                  T{t.number}
                </span>
                <span
                  className={`font-sans text-[11px] ${
                    isSelected ? "text-white/80" : "text-mondy-muted"
                  }`}
                >
                  Seats {t.capacity}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
