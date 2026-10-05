"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, Clock, MapPin, Minus, Phone, Plus, ShoppingBag, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { submitOnlineOrder } from "@/app/order/actions";
import { CardPayment } from "./CardPayment";

type SpiceLevel = "Mild" | "Medium" | "Hot";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  soldOut: boolean;
  lowStock: number | null;
  hasSpice: boolean;
};
type Category = { id: string; name: string; items: MenuItem[] };

type CartLine = {
  key: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  spiceLevel: SpiceLevel | null;
};

type OpenState = { open: true; closesAt: string } | { open: false; message: string };

type Props = {
  menu: Category[];
  restaurant: {
    name: string;
    address: string | null;
    phone: string | null;
    prepMinutes: number;
    taxRate: number;
  };
  openState: OpenState;
  payAtPickupLimit: number;
  cardEnabled: boolean;
  logoUrl: string | null;
};

type Step =
  | { name: "menu" }
  | { name: "checkout" }
  | { name: "pay"; orderId: string; clientSecret: string; total: number };

const SPICE: SpiceLevel[] = ["Mild", "Medium", "Hot"];

export function OnlineOrderApp({
  menu,
  restaurant,
  openState,
  payAtPickupLimit,
  cardEnabled,
  logoUrl,
}: Props) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [step, setStep] = useState<Step>({ name: "menu" });
  const [spiceFor, setSpiceFor] = useState<MenuItem | null>(null);

  const count = cart.reduce((s, l) => s + l.quantity, 0);
  const subtotal = Math.round(cart.reduce((s, l) => s + l.price * l.quantity, 0) * 100) / 100;
  const tax = Math.round(subtotal * restaurant.taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  function add(item: MenuItem, spiceLevel: SpiceLevel | null) {
    setCart((c) => {
      const key = `${item.id}:${spiceLevel ?? ""}`;
      const found = c.find((l) => l.key === key);
      if (found) {
        return c.map((l) => (l.key === key ? { ...l, quantity: Math.min(l.quantity + 1, 20) } : l));
      }
      return [
        ...c,
        { key, menuItemId: item.id, name: item.name, price: item.price, quantity: 1, spiceLevel },
      ];
    });
  }

  function changeQty(key: string, delta: number) {
    setCart((c) =>
      c
        .map((l) => (l.key === key ? { ...l, quantity: Math.min(l.quantity + delta, 20) } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function onAddTap(item: MenuItem) {
    if (item.hasSpice) setSpiceFor(item);
    else add(item, null);
  }

  const qtyInCart = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart) m.set(l.menuItemId, (m.get(l.menuItemId) ?? 0) + l.quantity);
    return m;
  }, [cart]);

  return (
    <div className="min-h-screen bg-mondy-cream text-mondy-ink">
      {/* Masthead */}
      <header className="relative overflow-hidden bg-mondy-red text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-mondy-yellow/90"
        />
        <div className="relative mx-auto max-w-2xl px-5 pb-7 pt-8">
          <div className="flex items-center gap-3">
            {logoUrl && (
              <Image
                src={logoUrl}
                alt=""
                width={52}
                height={52}
                priority
                className="h-13 w-13 rounded-full bg-white object-contain p-1"
              />
            )}
            <div>
              <h1 className="font-display text-3xl font-black leading-none sm:text-4xl">
                {restaurant.name}
              </h1>
              <p className="mt-1 text-sm text-white/85">Haitian cooking, ready for pickup</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/90">
            {restaurant.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" aria-hidden />
                {restaurant.address}
              </span>
            )}
            {restaurant.phone && (
              <a href={`tel:${restaurant.phone}`} className="flex items-center gap-1.5 underline-offset-2 hover:underline">
                <Phone className="h-4 w-4" aria-hidden />
                {restaurant.phone}
              </a>
            )}
          </div>

          <p
            className={`mt-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
              openState.open ? "bg-white text-mondy-ink" : "bg-mondy-ink text-white"
            }`}
          >
            <Clock className="h-4 w-4" aria-hidden />
            {openState.open
              ? `Ready in about ${restaurant.prepMinutes} min${openState.closesAt ? ` · orders until ${openState.closesAt}` : ""}`
              : openState.message}
          </p>
        </div>
      </header>

      {step.name === "menu" && (
        <>
          <nav
            aria-label="Menu sections"
            className="sticky top-0 z-20 border-b border-mondy-border bg-mondy-cream/95 backdrop-blur"
          >
            <div className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-5 py-3">
              {menu.map((c) => (
                <a
                  key={c.id}
                  href={`#cat-${c.id}`}
                  className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium ring-1 ring-mondy-border hover:bg-mondy-yellow-soft/50"
                >
                  {c.name}
                </a>
              ))}
            </div>
          </nav>

          <main className="mx-auto max-w-2xl px-5 pb-32 pt-2">
            {menu.map((c) => (
              <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-16 pt-6">
                <h2 className="font-display text-2xl font-black text-mondy-red-dark">{c.name}</h2>
                <ul className="mt-3 divide-y divide-mondy-border border-y border-mondy-border">
                  {c.items.map((item) => {
                    const inCart = qtyInCart.get(item.id) ?? 0;
                    const atLimit = item.lowStock !== null && inCart >= item.lowStock;
                    const disabled = !openState.open || item.soldOut || atLimit;
                    return (
                      <li key={item.id} className="flex items-start gap-4 py-4">
                        <div className="min-w-0 flex-1">
                          <p className={`font-semibold ${item.soldOut ? "text-mondy-muted" : ""}`}>
                            {item.name}
                          </p>
                          {item.description && (
                            <p className="mt-0.5 text-sm leading-relaxed text-mondy-muted">
                              {item.description}
                            </p>
                          )}
                          <p className="mt-1.5 flex items-center gap-2 text-sm">
                            <span className="tabular font-semibold">{formatMoney(item.price)}</span>
                            {item.soldOut && <span className="text-mondy-muted">Sold out today</span>}
                            {item.lowStock !== null && (
                              <span className="font-semibold text-mondy-red">
                                Only {item.lowStock} left
                              </span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onAddTap(item)}
                          disabled={disabled}
                          aria-label={`Add ${item.name}`}
                          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-mondy-red text-white shadow-sm transition hover:bg-mondy-red-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30 disabled:bg-mondy-border disabled:text-mondy-muted disabled:shadow-none"
                        >
                          <Plus className="h-5 w-5" aria-hidden />
                          {inCart > 0 && (
                            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-mondy-yellow px-1 text-[11px] font-bold text-mondy-ink">
                              {inCart}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </main>

          {count > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 pt-2">
              <button
                type="button"
                onClick={() => setStep({ name: "checkout" })}
                className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-2xl bg-mondy-ink px-5 py-4 text-white shadow-xl transition hover:bg-black focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-yellow/60"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <ShoppingBag className="h-5 w-5" aria-hidden />
                  Review order ({count})
                </span>
                <span className="tabular font-semibold">{formatMoney(subtotal)}</span>
              </button>
            </div>
          )}
        </>
      )}

      {step.name === "checkout" && (
        <Checkout
          cart={cart}
          subtotal={subtotal}
          tax={tax}
          total={total}
          open={openState.open}
          cardEnabled={cardEnabled}
          payAtPickupLimit={payAtPickupLimit}
          onBack={() => setStep({ name: "menu" })}
          onChangeQty={changeQty}
          onPickupPlaced={(orderId) => router.push(`/order/status/${orderId}`)}
          onCardReady={(orderId, clientSecret, serverTotal) =>
            setStep({ name: "pay", orderId, clientSecret, total: serverTotal })
          }
        />
      )}

      {step.name === "pay" && (
        <main className="mx-auto max-w-2xl px-5 pb-16 pt-6">
          <h2 className="font-display text-2xl font-black">Pay for your order</h2>
          <p className="mt-1 text-sm text-mondy-muted">
            Your order goes to the kitchen as soon as the payment goes through.
          </p>
          <div className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
            <CardPayment clientSecret={step.clientSecret} orderId={step.orderId} total={step.total} />
          </div>
        </main>
      )}

      {spiceFor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="spice-title"
          className="fixed inset-0 z-40 flex items-end justify-center bg-mondy-ink/50 sm:items-center"
          onClick={() => setSpiceFor(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl bg-white p-6 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="spice-title" className="font-display text-xl font-black">
                  How spicy?
                </p>
                <p className="text-sm text-mondy-muted">{spiceFor.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSpiceFor(null)}
                aria-label="Close"
                className="rounded-full p-1.5 text-mondy-muted hover:bg-mondy-cream"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {SPICE.map((level, i) => (
                <button
                  key={level}
                  type="button"
                  autoFocus={i === 1}
                  onClick={() => {
                    add(spiceFor, level);
                    setSpiceFor(null);
                  }}
                  className="rounded-2xl bg-mondy-cream px-3 py-4 font-semibold ring-1 ring-mondy-border transition hover:bg-mondy-yellow-soft/60 focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30"
                >
                  <span aria-hidden className="block text-lg">
                    {"🌶️".repeat(i + 1)}
                  </span>
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Checkout({
  cart,
  subtotal,
  tax,
  total,
  open,
  cardEnabled,
  payAtPickupLimit,
  onBack,
  onChangeQty,
  onPickupPlaced,
  onCardReady,
}: {
  cart: CartLine[];
  subtotal: number;
  tax: number;
  total: number;
  open: boolean;
  cardEnabled: boolean;
  payAtPickupLimit: number;
  onBack: () => void;
  onChangeQty: (key: string, delta: number) => void;
  onPickupPlaced: (orderId: string) => void;
  onCardReady: (orderId: string, clientSecret: string, total: number) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const pickupAllowed = total <= payAtPickupLimit;
  const [payment, setPayment] = useState<"card" | "pickup">(cardEnabled ? "card" : "pickup");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const effectivePayment = payment === "pickup" && !pickupAllowed ? "card" : payment;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await submitOnlineOrder({
          lines: cart.map((l) => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
            spiceLevel: l.spiceLevel,
          })),
          customerName: name,
          customerPhone: phone,
          customerEmail: email,
          notes,
          payment: effectivePayment,
          website,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        if (res.kind === "pickup") onPickupPlaced(res.orderId);
        else onCardReady(res.orderId, res.clientSecret, res.total);
      } catch {
        setError("Couldn't reach the restaurant. Check your connection and try again.");
      }
    });
  }

  const field =
    "mt-1.5 h-12 w-full rounded-xl bg-white px-3.5 text-base ring-1 ring-mondy-border placeholder:text-mondy-muted focus:outline-none focus:ring-2 focus:ring-mondy-red/50";

  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-mondy-ink hover:text-mondy-red"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to menu
      </button>

      <h2 className="mt-3 font-display text-2xl font-black">Your order</h2>

      {cart.length === 0 ? (
        <p className="mt-4 text-mondy-muted">Your cart is empty. Go back to add something.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-mondy-border rounded-2xl bg-white px-4 ring-1 ring-mondy-border">
            {cart.map((l) => (
              <li key={l.key} className="flex items-center gap-3 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.name}</p>
                  {l.spiceLevel && <p className="text-sm text-mondy-muted">{l.spiceLevel}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onChangeQty(l.key, -1)}
                    aria-label={`One less ${l.name}`}
                    className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-mondy-border hover:bg-mondy-cream"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-7 text-center tabular font-semibold">{l.quantity}</span>
                  <button
                    type="button"
                    onClick={() => onChangeQty(l.key, 1)}
                    aria-label={`One more ${l.name}`}
                    className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-mondy-border hover:bg-mondy-cream"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="w-20 text-right tabular">{formatMoney(l.price * l.quantity)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-3 space-y-1 px-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-mondy-muted">Subtotal</dt>
              <dd className="tabular">{formatMoney(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mondy-muted">Meals tax</dt>
              <dd className="tabular">{formatMoney(tax)}</dd>
            </div>
            <div className="flex justify-between pt-1 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular">{formatMoney(total)}</dd>
            </div>
          </dl>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <h3 className="font-display text-xl font-black">Pickup details</h3>

            <label className="block text-sm font-medium">
              Name for the order
              <input
                className={field}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                maxLength={60}
              />
            </label>
            <label className="block text-sm font-medium">
              Phone
              <input
                className={field}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(978) 555-0123"
                required
              />
              <span className="mt-1 block text-xs font-normal text-mondy-muted">
                Only used if we need to reach you about this order.
              </span>
            </label>
            <label className="block text-sm font-medium">
              Email for receipt <span className="font-normal text-mondy-muted">(optional)</span>
              <input
                className={field}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
              />
            </label>
            <label className="block text-sm font-medium">
              Notes for the kitchen <span className="font-normal text-mondy-muted">(optional)</span>
              <textarea
                className={`${field} h-20 py-2.5`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={200}
                placeholder="Allergies, extra sauce on the side…"
              />
            </label>

            {/* Honeypot: hidden from people, filled in by bots */}
            <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
              <label>
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
            </div>

            <fieldset>
              <legend className="font-display text-xl font-black">Payment</legend>
              <div className="mt-2 grid gap-2">
                {cardEnabled && (
                  <PayOption
                    checked={effectivePayment === "card"}
                    onChange={() => setPayment("card")}
                    title="Pay now with card"
                    detail="Apple Pay, Google Pay, and cards"
                  />
                )}
                <PayOption
                  checked={effectivePayment === "pickup"}
                  onChange={() => setPayment("pickup")}
                  disabled={!pickupAllowed}
                  title="Pay at pickup"
                  detail={
                    pickupAllowed
                      ? "Cash or card at the counter"
                      : `Available for orders up to ${formatMoney(payAtPickupLimit)}`
                  }
                />
              </div>
            </fieldset>

            {error && (
              <p role="alert" className="rounded-xl bg-mondy-red/10 px-4 py-3 text-sm text-mondy-red-dark">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending || !open || cart.length === 0}
              className="w-full rounded-2xl bg-mondy-red px-5 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-mondy-red-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30 disabled:opacity-60"
            >
              {pending
                ? "Placing order…"
                : effectivePayment === "card"
                  ? "Continue to payment"
                  : `Place order · ${formatMoney(total)}`}
            </button>
          </form>
        </>
      )}
    </main>
  );
}

function PayOption({
  checked,
  onChange,
  disabled,
  title,
  detail,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3.5 ring-1 transition ${
        checked ? "ring-2 ring-mondy-red" : "ring-mondy-border"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        type="radio"
        name="payment"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="h-4 w-4 accent-mondy-red"
      />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-mondy-muted">{detail}</span>
      </span>
    </label>
  );
}
