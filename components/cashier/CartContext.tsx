"use client";

import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  type ReactNode,
} from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OrderType = "DINE_IN" | "TAKEOUT";
export type SpiceLevel = "Mild" | "Medium" | "Hot";

export type CartLine = {
  // A unique id PER LINE (not per menu item) so the same item with
  // different modifiers/notes is two separate lines in the cart.
  lineId: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  spiceLevel?: SpiceLevel;
  notes?: string;
};

export type AppliedDiscount = {
  // Snapshot of what was applied. We resolve against the DB at checkout.
  id: string;            // Discount.id from DB
  code: string;          // e.g. "STAFF10"
  name: string;          // e.g. "Staff discount"
  type: "PERCENT" | "FIXED_AMOUNT" | "COMP";
  value: number;         // 10 means "10%" for PERCENT, or "$10" for FIXED
  appliedByStaffId: string;
  reason?: string;       // required for COMP
};

type CartState = {
  lines: CartLine[];
  orderType: OrderType;
  tableId: string | null;
  customerName: string;
  discount: AppliedDiscount | null;
};

type Action =
  | {
      type: "ADD_ITEM";
      menuItemId: string;
      name: string;
      unitPrice: number;
      spiceLevel?: "Mild" | "Medium" | "Hot";
    }
  | { type: "INCREMENT"; lineId: string }
  | { type: "DECREMENT"; lineId: string }
  | { type: "REMOVE_LINE"; lineId: string }
  | { type: "CLEAR" }
  | { type: "SET_ORDER_TYPE"; orderType: OrderType }
  | { type: "SET_TABLE"; tableId: string | null }
  | { type: "SET_CUSTOMER_NAME"; name: string }
  | { type: "APPLY_DISCOUNT"; discount: AppliedDiscount }
  | { type: "REMOVE_DISCOUNT" };

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────

const initialState: CartState = {
  lines: [],
  orderType: "DINE_IN",
  tableId: null,
  customerName: "",
  discount: null,
};

function reducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case "ADD_ITEM": {
      // Dedupe key: same menu item AND same spice level (or both undefined).
      // Different spice levels → separate lines (because they're literally
      // different dishes to the kitchen).
      const existing = state.lines.find(
        (l) =>
          l.menuItemId === action.menuItemId &&
          l.spiceLevel === action.spiceLevel &&
          !l.notes,
      );
      if (existing) {
        return {
          ...state,
          lines: state.lines.map((l) =>
            l.lineId === existing.lineId
              ? { ...l, quantity: l.quantity + 1 }
              : l,
          ),
        };
      }
      return {
        ...state,
        lines: [
          ...state.lines,
          {
            lineId: crypto.randomUUID(),
            menuItemId: action.menuItemId,
            name: action.name,
            unitPrice: action.unitPrice,
            quantity: 1,
            spiceLevel: action.spiceLevel,
          },
        ],
      };
    }
    case "INCREMENT":
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.lineId === action.lineId
            ? { ...l, quantity: l.quantity + 1 }
            : l,
        ),
      };
    case "DECREMENT":
      return {
        ...state,
        lines: state.lines
          .map((l) =>
            l.lineId === action.lineId
              ? { ...l, quantity: l.quantity - 1 }
              : l,
          )
          .filter((l) => l.quantity > 0),
      };
    case "REMOVE_LINE":
      return {
        ...state,
        lines: state.lines.filter((l) => l.lineId !== action.lineId),
      };
    case "CLEAR":
      return { ...initialState, orderType: state.orderType };
    case "SET_ORDER_TYPE":
      return {
        ...state,
        orderType: action.orderType,
        tableId: action.orderType === "TAKEOUT" ? null : state.tableId,
      };
    case "SET_TABLE":
      return { ...state, tableId: action.tableId };
    case "SET_CUSTOMER_NAME":
      return { ...state, customerName: action.name };
    case "APPLY_DISCOUNT":
      return { ...state, discount: action.discount };
    case "REMOVE_DISCOUNT":
      return { ...state, discount: null };
    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

type CartContextValue = {
  state: CartState;
  // Derived values
  itemCount: number;
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;  // subtotal - discount (what tax is applied to)
  taxAmount: number;
  total: number;
  // Actions
  addItem: (
    menuItemId: string,
    name: string,
    unitPrice: number,
    spiceLevel?: SpiceLevel,
  ) => void;
  increment: (lineId: string) => void;
  decrement: (lineId: string) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
  setOrderType: (orderType: OrderType) => void;
  setTable: (tableId: string | null) => void;
  setCustomerName: (name: string) => void;
  applyDiscount: (discount: AppliedDiscount) => void;
  removeDiscount: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  children,
  taxRate,
}: {
  children: ReactNode;
  taxRate: number;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = state.lines.reduce(
      (sum, l) => sum + l.unitPrice * l.quantity,
      0,
    );
    const subtotalRounded = Math.round(subtotal * 100) / 100;

    // Compute discount amount.
    let discountAmount = 0;
    if (state.discount) {
      if (state.discount.type === "PERCENT") {
        discountAmount = (subtotalRounded * state.discount.value) / 100;
      } else if (state.discount.type === "FIXED_AMOUNT") {
        discountAmount = state.discount.value;
      } else if (state.discount.type === "COMP") {
        // COMP value is the dollar amount comped (could be the whole subtotal
        // or partial — manager decides at apply time).
        discountAmount = state.discount.value;
      }
      // Never let discount exceed subtotal.
      discountAmount = Math.min(discountAmount, subtotalRounded);
    }
    discountAmount = Math.round(discountAmount * 100) / 100;

    const taxableAmount = Math.round((subtotalRounded - discountAmount) * 100) / 100;
    const taxAmount = Math.round(taxableAmount * taxRate * 100) / 100;
    const total = Math.round((taxableAmount + taxAmount) * 100) / 100;
    const itemCount = state.lines.reduce((sum, l) => sum + l.quantity, 0);

    return {
      state,
      itemCount,
      subtotal: subtotalRounded,
      discountAmount,
      taxableAmount,
      taxAmount,
      total,
      addItem: (menuItemId, name, unitPrice, spiceLevel) =>
        dispatch({
          type: "ADD_ITEM",
          menuItemId,
          name,
          unitPrice,
          spiceLevel,
        }),
      increment: (lineId) => dispatch({ type: "INCREMENT", lineId }),
      decrement: (lineId) => dispatch({ type: "DECREMENT", lineId }),
      removeLine: (lineId) => dispatch({ type: "REMOVE_LINE", lineId }),
      clear: () => dispatch({ type: "CLEAR" }),
      setOrderType: (orderType) =>
        dispatch({ type: "SET_ORDER_TYPE", orderType }),
      setTable: (tableId) => dispatch({ type: "SET_TABLE", tableId }),
      setCustomerName: (name) =>
        dispatch({ type: "SET_CUSTOMER_NAME", name }),
      applyDiscount: (discount) =>
        dispatch({ type: "APPLY_DISCOUNT", discount }),
      removeDiscount: () => dispatch({ type: "REMOVE_DISCOUNT" }),
    };
  }, [state, taxRate]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside a CartProvider");
  return ctx;
}
