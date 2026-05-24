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

export type OrderType = "DINE_IN" | "TAKEOUT" | "DELIVERY";
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
  customerPhone: string;
  deliveryAddress: string;
  deliveryNotes: string;
  discount: AppliedDiscount | null;
  tipAmount: number;
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
  | { type: "SET_CUSTOMER_PHONE"; phone: string }
  | { type: "SET_DELIVERY_ADDRESS"; address: string }
  | { type: "SET_DELIVERY_NOTES"; notes: string }
  | { type: "APPLY_DISCOUNT"; discount: AppliedDiscount }
  | { type: "REMOVE_DISCOUNT" }
  | { type: "SET_TIP"; amount: number }
  | { type: "CLEAR_TIP" };

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────

const initialState: CartState = {
  lines: [],
  orderType: "DINE_IN",
  tableId: null,
  customerName: "",
  customerPhone: "",
  deliveryAddress: "",
  deliveryNotes: "",
  discount: null,
  tipAmount: 0,
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
      // Switching out of DINE_IN clears the table; into DINE_IN clears delivery info.
      // Customer name/phone are shared across TAKEOUT and DELIVERY.
      if (action.orderType === "DINE_IN") {
        return {
          ...state,
          orderType: action.orderType,
          deliveryAddress: "",
          deliveryNotes: "",
        };
      }
      return {
        ...state,
        orderType: action.orderType,
        tableId: null,
      };
    case "SET_TABLE":
      return { ...state, tableId: action.tableId };
    case "SET_CUSTOMER_NAME":
      return { ...state, customerName: action.name };
    case "SET_CUSTOMER_PHONE":
      return { ...state, customerPhone: action.phone };
    case "SET_DELIVERY_ADDRESS":
      return { ...state, deliveryAddress: action.address };
    case "SET_DELIVERY_NOTES":
      return { ...state, deliveryNotes: action.notes };
    case "APPLY_DISCOUNT":
      return { ...state, discount: action.discount };
    case "REMOVE_DISCOUNT":
      return { ...state, discount: null };
    case "SET_TIP":
      return {
        ...state,
        tipAmount: Math.max(0, Math.round(action.amount * 100) / 100),
      };
    case "CLEAR_TIP":
      return { ...state, tipAmount: 0 };
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
  tipAmount: number;
  deliveryFee: number;    // 0 for non-delivery orders
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
  setCustomerPhone: (phone: string) => void;
  setDeliveryAddress: (address: string) => void;
  setDeliveryNotes: (notes: string) => void;
  applyDiscount: (discount: AppliedDiscount) => void;
  removeDiscount: () => void;
  setTip: (amount: number) => void;
  clearTip: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  children,
  taxRate,
  defaultDeliveryFee,
}: {
  children: ReactNode;
  taxRate: number;
  defaultDeliveryFee: number;
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
        discountAmount = state.discount.value;
      }
      discountAmount = Math.min(discountAmount, subtotalRounded);
    }
    discountAmount = Math.round(discountAmount * 100) / 100;

    const taxableAmount =
      Math.round((subtotalRounded - discountAmount) * 100) / 100;
    // Tax applies to food only — NOT to delivery fee (matches MA service-fee rules).
    const taxAmount = Math.round(taxableAmount * taxRate * 100) / 100;
    const tipAmount = Math.round(state.tipAmount * 100) / 100;
    // Defensive: a missing/NaN defaultDeliveryFee should fall back to 0 fee,
    // not corrupt the total.
    const safeDeliveryFee =
      typeof defaultDeliveryFee === "number" && !isNaN(defaultDeliveryFee)
        ? defaultDeliveryFee
        : 0;
    const deliveryFee =
      state.orderType === "DELIVERY"
        ? Math.round(safeDeliveryFee * 100) / 100
        : 0;
    const total =
      Math.round(
        (taxableAmount + taxAmount + tipAmount + deliveryFee) * 100,
      ) / 100;
    const itemCount = state.lines.reduce((sum, l) => sum + l.quantity, 0);

    return {
      state,
      itemCount,
      subtotal: subtotalRounded,
      discountAmount,
      taxableAmount,
      taxAmount,
      tipAmount,
      deliveryFee,
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
      setCustomerPhone: (phone) =>
        dispatch({ type: "SET_CUSTOMER_PHONE", phone }),
      setDeliveryAddress: (address) =>
        dispatch({ type: "SET_DELIVERY_ADDRESS", address }),
      setDeliveryNotes: (notes) =>
        dispatch({ type: "SET_DELIVERY_NOTES", notes }),
      applyDiscount: (discount) =>
        dispatch({ type: "APPLY_DISCOUNT", discount }),
      removeDiscount: () => dispatch({ type: "REMOVE_DISCOUNT" }),
      setTip: (amount) => dispatch({ type: "SET_TIP", amount }),
      clearTip: () => dispatch({ type: "CLEAR_TIP" }),
    };
  }, [state, taxRate, defaultDeliveryFee]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside a CartProvider");
  return ctx;
}