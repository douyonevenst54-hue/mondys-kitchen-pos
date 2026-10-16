"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, Clock, MapPin, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { checkSelection, priceStartsFrom, selectionKey, type OptionGroup } from "@/lib/options";
import { submitOnlineOrder } from "@/app/order/actions";
import { Wordmark } from "@/components/brand/Wordmark";
import { OptionPicker } from "@/components/menu/OptionPicker";
import { CallButton } from "./CallButton";
import { CardPayment } from "./CardPayment";
import { ClubCorner, type ClubPost } from "./ClubCorner";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  soldOut: boolean;
  lowStock: number | null;
  menuNumber: number | null;
  isSignature: boolean;
  imageUrl: string | null;
  optionGroups: OptionGroup[];
};
type Category = { id: string; name: string; items: MenuItem[] };

type CartLine = {
  key: string;
  menuItemId: string;
  name: string;
  price: number; // base + choices
  quantity: number;
  optionIds: string[];
  summary: string;
};

type OpenState = { open: true; closesAt: string } | { open: false; message: string };
type PickupSlot = { value: string; label: string };

/* The cart is kept on the customer's phone, so a reload, a phone call, or
   going back from the payment page doesn't empty it. */
const CART_KEY = "rosewood_cart_v1";
const CONTACT_KEY = "rosewood_contact_v1";
const CART_TTL_MS = 3 * 60 * 60 * 1000;

function store<T>(key: string, value: T | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / storage blocked: the cart just isn't saved */
  }
}
function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Saved lines checked against today's menu: gone or sold-out dishes drop, prices refresh. */
function restoreCart(menu: Category[]): CartLine[] {
  const saved = load<{ at: number; lines: CartLine[] }>(CART_KEY);
  if (!saved || !Array.isArray(saved.lines) || Date.now() - saved.at > CART_TTL_MS) return [];
  const items = new Map(menu.flatMap((c) => c.items).map((i) => [i.id, i]));
  const out: CartLine[] = [];
  for (const l of saved.lines) {
    const item = items.get(l.menuItemId);
    if (!item || item.soldOut || !Array.isArray(l.optionIds)) continue;
    const sel = checkSelection(item.optionGroups, l.optionIds);
    if (!sel.ok) continue;
    let quantity = Math.max(1, Math.min(Math.floor(Number(l.quantity)) || 1, 20));
    if (item.lowStock !== null) quantity = Math.min(quantity, item.lowStock);
    if (quantity < 1) continue;
    out.push({
      key: selectionKey(item.id, l.optionIds),
      menuItemId: item.id,
      name: item.name,
      price: Math.round((item.price + sel.extra) * 100) / 100,
      quantity,
      optionIds: l.optionIds,
      summary: sel.summary,
    });
  }
  return out;
}

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
  cardProvider: "clover" | "stripe" | null;
  stripeKey: string | null;
  logoUrl: string | null;
  clubPosts: ClubPost[];
  pickupSlots: PickupSlot[];
};

type Step =
  | { name: "menu" }
  | { name: "checkout" }
  | { name: "pay"; orderId: string; clientSecret: string; total: number };

const SPECIAL_CATEGORY = "Passport Special";

export function OnlineOrderApp({
  menu,
  restaurant,
  openState,
  payAtPickupLimit,
  cardEnabled,
  cardProvider,
  stripeKey,
  logoUrl,
  clubPosts,
  pickupSlots,
}: Props) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [step, setStep] = useState<Step>({ name: "menu" });
  const [choosing, setChoosing] = useState<MenuItem | null>(null);
  const restored = useRef(false);

  // Bring back a saved cart after the page loads (never during server render).
  useEffect(() => {
    const t = setTimeout(() => {
      const lines = restoreCart(menu);
      restored.current = true;
      if (lines.length) setCart(lines);
    }, 0);
    return () => clearTimeout(t);
  }, [menu]);

  useEffect(() => {
    if (!restored.current) return;
    store(CART_KEY, cart.length ? { at: Date.now(), lines: cart } : null);
  }, [cart]);

  const count = cart.reduce((s, l) => s + l.quantity, 0);
  const subtotal = Math.round(cart.reduce((s, l) => s + l.price * l.quantity, 0) * 100) / 100;
  const tax = Math.round(subtotal * restaurant.taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const hasSignature = menu.some((c) => c.items.some((i) => i.isSignature));

  function add(item: MenuItem, optionIds: string[] = [], summary = "", price = item.price) {
    setCart((c) => {
      const key = selectionKey(item.id, optionIds);
      const found = c.find((l) => l.key === key);
      if (found) {
        return c.map((l) => (l.key === key ? { ...l, quantity: Math.min(l.quantity + 1, 20) } : l));
      }
      return [...c, { key, menuItemId: item.id, name: item.name, price, quantity: 1, optionIds, summary }];
    });
  }

  function changeQty(key: string, delta: number) {
    setCart((c) =>
      c
        .map((l) => {
          if (l.key !== key) return l;
          let quantity = Math.min(l.quantity + delta, 20);
          const stock = menu.flatMap((cat) => cat.items).find((i) => i.id === l.menuItemId)?.lowStock;
          if (delta > 0 && stock != null) {
            const others = c.filter((x) => x.menuItemId === l.menuItemId && x.key !== key).reduce((s, x) => s + x.quantity, 0);
            quantity = Math.min(quantity, Math.max(stock - others, l.quantity));
          }
          return { ...l, quantity };
        })
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(key: string) {
    setCart((c) => c.filter((l) => l.key !== key));
  }

  function onAddTap(item: MenuItem) {
    if (item.optionGroups.length > 0) setChoosing(item);
    else add(item);
  }

  const qtyInCart = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart) m.set(l.menuItemId, (m.get(l.menuItemId) ?? 0) + l.quantity);
    return m;
  }, [cart]);

  /** Why a dish can't be added right now (null = it can). */
  function unavailableReason(item: MenuItem): string | null {
    if (!openState.open) return "Ordering is closed right now";
    if (item.soldOut) return "Sold out today";
    if (item.lowStock !== null && (qtyInCart.get(item.id) ?? 0) >= item.lowStock) return "That's all we have left";
    return null;
  }

  return (
    <div className="min-h-screen bg-mondy-cream text-mondy-ink">
      {/* Masthead — set like the printed menu */}
      <header className="px-5 pb-6 pt-10">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          {logoUrl && (
            <Image src={logoUrl} alt="" width={64} height={64} priority className="mb-4 h-16 w-16 object-contain" />
          )}
          <Wordmark size="lg" />
          <span aria-hidden className="mt-5 h-px w-full bg-mondy-red" />

          <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-sm text-mondy-muted">
            {restaurant.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" aria-hidden />
                {restaurant.address}
              </span>
            )}
          </div>
          {restaurant.phone && <CallButton phone={restaurant.phone} className="mt-4" />}

          <p
            className={`mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
              openState.open ? "bg-white text-mondy-ink ring-1 ring-mondy-border" : "bg-mondy-ink text-white"
            }`}
          >
            <Clock className="h-4 w-4" aria-hidden />
            {openState.open
              ? `Pickup in about ${restaurant.prepMinutes} min${openState.closesAt ? ` · orders until ${openState.closesAt}` : ""}`
              : openState.message}
          </p>
        </div>
      </header>

      {step.name === "menu" && (
        <>
          <nav aria-label="Menu sections" className="sticky top-0 z-20 border-y border-mondy-border bg-mondy-cream/95 backdrop-blur">
            <div className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-4 py-2.5">
              {clubPosts.length > 0 && (
                <a
                  href="#ps-club"
                  className="shrink-0 rounded-full bg-mondy-red px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-mondy-red-dark"
                >
                  PS Club
                </a>
              )}
              {menu.map((c) => (
                <a
                  key={c.id}
                  href={`#cat-${c.id}`}
                  className="shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold text-mondy-ink transition hover:bg-mondy-yellow"
                >
                  {c.name}
                </a>
              ))}
            </div>
          </nav>

          <main className="mx-auto max-w-2xl px-5 pb-36 pt-4">
            <ClubCorner posts={clubPosts} />

            {menu.length === 0 && (
              <p className="py-20 text-center text-mondy-muted">The online menu is being updated. Please call us to order.</p>
            )}

            {menu.map((c) =>
              c.name === SPECIAL_CATEGORY ? (
                <section key={c.id} id={`cat-${c.id}`} className="mt-10 scroll-mt-20 rounded-2xl bg-mondy-yellow px-6 py-7 text-center">
                  <h2 className="font-display text-xl font-black uppercase text-mondy-red">PS: Passport Special</h2>
                  <p className="mt-1 text-sm font-medium italic">A little taste of somewhere different.</p>
                  {c.items.map((item) => (
                    <div key={item.id} className="mt-4">
                      {item.imageUrl && (
                        <button
                          type="button"
                          onClick={() => setChoosing(item)}
                          aria-label={`See a photo of ${item.name}`}
                          className="mx-auto mb-4 block w-full max-w-sm overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
                        </button>
                      )}
                      <h3 className="font-display text-2xl font-black leading-tight">{item.name}</h3>
                      <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-mondy-ink/80">
                        {item.description || "A rotating chef-inspired dish featuring flavors from around the world."}
                      </p>
                      <p className="mt-2 text-lg font-bold tabular">{formatMoney(item.price)}</p>
                      <button
                        type="button"
                        onClick={() => onAddTap(item)}
                        disabled={!openState.open || item.soldOut}
                        aria-label={item.soldOut ? undefined : `Add ${item.name} to order`}
                        className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-mondy-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-mondy-red-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30 disabled:bg-mondy-border disabled:text-mondy-muted"
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                        {item.soldOut ? "Today's PS is sold out" : "Add to order"}
                      </button>
                    </div>
                  ))}
                </section>
              ) : (
                <section key={c.id} id={`cat-${c.id}`} className="mt-10 scroll-mt-20">
                  <h2 className="border-b border-mondy-red pb-2 font-display text-lg font-black uppercase tracking-wide text-mondy-red">
                    {c.name}
                  </h2>
                  <ul className="divide-y divide-mondy-border/70">
                    {c.items.map((item) => {
                      const inCart = qtyInCart.get(item.id) ?? 0;
                      const atLimit = item.lowStock !== null && inCart >= item.lowStock;
                      const disabled = !openState.open || item.soldOut || atLimit;
                      return (
                        <li key={item.id} className="flex items-start gap-4 py-4">
                          <div className="min-w-0 flex-1">
                            <p className={`text-[17px] font-bold leading-snug ${item.soldOut ? "text-mondy-muted" : ""}`}>
                              {item.menuNumber != null && <span className="tabular">{item.menuNumber}. </span>}
                              {item.isSignature && (
                                <span className="text-mondy-red" title="Rosewood Signature" aria-label="Rosewood Signature">
                                  ★{" "}
                                </span>
                              )}
                              {item.name}
                            </p>
                            {item.description && (
                              <p className="mt-0.5 text-sm leading-relaxed text-mondy-muted">{item.description}</p>
                            )}
                            {item.optionGroups.length > 0 && (
                              <p className="mt-1 text-sm italic text-mondy-red-dark">
                                Choose {item.optionGroups.map((g) => g.name.toLowerCase()).join(", ")}
                              </p>
                            )}
                            <p className="mt-1.5 flex items-center gap-2 text-sm">
                              <span className="tabular font-semibold">
                                {priceStartsFrom(item.optionGroups) && <span className="font-normal text-mondy-muted">from </span>}
                                {formatMoney(item.price)}
                              </span>
                              {item.soldOut && <span className="text-mondy-muted">Sold out today</span>}
                              {item.lowStock !== null && (
                                <span className="font-semibold text-mondy-red">Only {item.lowStock} left</span>
                              )}
                            </p>
                          </div>
                          {(() => {
                            const addButton = (
                              <button
                                type="button"
                                onClick={() => onAddTap(item)}
                                disabled={disabled}
                                aria-label={`Add ${item.name}`}
                                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-mondy-red text-white shadow-sm transition hover:bg-mondy-red-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30 disabled:bg-mondy-border disabled:text-mondy-muted disabled:shadow-none ${
                                  item.imageUrl ? "absolute -bottom-2 -right-2 ring-4 ring-mondy-cream" : "relative mt-0.5"
                                }`}
                              >
                                <Plus className="h-5 w-5" aria-hidden />
                                {inCart > 0 && (
                                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-mondy-ink px-1 text-[11px] font-bold text-white">
                                    {inCart}
                                  </span>
                                )}
                              </button>
                            );
                            if (!item.imageUrl) return addButton;
                            return (
                              <div className="relative shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setChoosing(item)}
                                  aria-label={`See a photo of ${item.name}`}
                                  className="block h-24 w-24 overflow-hidden rounded-2xl bg-mondy-yellow-soft ring-1 ring-mondy-border focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30 sm:h-28 sm:w-28"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={item.imageUrl}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className={`h-full w-full object-cover ${item.soldOut ? "opacity-50 grayscale" : ""}`}
                                  />
                                </button>
                                {addButton}
                              </div>
                            );
                          })()}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ),
            )}

            <nav aria-label="More from Rosewood" className="mt-12 grid grid-cols-3 gap-2 text-center">
              {[
                { href: "/order/contact?type=catering", title: "Catering", sub: "Events & large orders" },
                { href: "/order/contact", title: "Contact us", sub: "Questions" },
                { href: "/order/contact?type=feedback", title: "Feedback", sub: "How did we do?" },
              ].map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="rounded-2xl bg-white px-2 py-3 ring-1 ring-mondy-border transition hover:ring-mondy-red/50 focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30"
                >
                  <span className="block font-display text-[15px] font-black text-mondy-red">{l.title}</span>
                  <span className="block text-xs text-mondy-muted">{l.sub}</span>
                </a>
              ))}
            </nav>

            <footer className="mt-8 border-t border-mondy-rule pt-5 text-center text-sm text-mondy-muted">
              {hasSignature && (
                <p>
                  <span className="text-mondy-red">★</span> Rosewood Signature
                </p>
              )}
              <p className="mt-1 italic">Please let our team know about any food allergies or dietary concerns when ordering.</p>
            </footer>
          </main>

          {count > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 pt-2">
              <button
                type="button"
                onClick={() => setStep({ name: "checkout" })}
                className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-2xl bg-mondy-ink px-5 py-4 text-white shadow-xl transition hover:bg-black focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/40"
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
          cardProvider={cardProvider}
          payAtPickupLimit={payAtPickupLimit}
          onBack={() => setStep({ name: "menu" })}
          onChangeQty={changeQty}
          onRemove={removeLine}
          phone={restaurant.phone}
          prepMinutes={restaurant.prepMinutes}
          pickupSlots={pickupSlots}
          canAddMore={(l) => {
            const item = menu.flatMap((c) => c.items).find((i) => i.id === l.menuItemId);
            return !!item && l.quantity < 20 && (item.lowStock === null || (qtyInCart.get(item.id) ?? 0) < item.lowStock);
          }}
          onPickupPlaced={(orderId) => {
            store(CART_KEY, null);
            router.push(`/order/status/${orderId}`);
          }}
          onCardReady={(orderId, clientSecret, serverTotal) =>
            setStep({ name: "pay", orderId, clientSecret, total: serverTotal })
          }
        />
      )}

      {step.name === "pay" && (
        <main className="mx-auto max-w-2xl px-5 pb-16 pt-2">
          <h2 className="font-display text-2xl font-black">Pay for your order</h2>
          <p className="mt-1 text-sm text-mondy-muted">
            Your order goes to the kitchen as soon as the payment goes through.
          </p>
          <div className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-mondy-border">
            <CardPayment stripeKey={stripeKey ?? ""} clientSecret={step.clientSecret} orderId={step.orderId} total={step.total} />
          </div>
        </main>
      )}

      {choosing && (
        <OptionPicker
          name={choosing.name}
          description={choosing.description}
          imageUrl={choosing.imageUrl}
          unavailable={unavailableReason(choosing)}
          basePrice={choosing.price}
          groups={choosing.optionGroups}
          onClose={() => setChoosing(null)}
          onAdd={(ids, summary, unitPrice) => {
            add(choosing, ids, summary, unitPrice);
            setChoosing(null);
          }}
        />
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
  cardProvider,
  payAtPickupLimit,
  onBack,
  onChangeQty,
  onRemove,
  canAddMore,
  phone: restaurantPhone,
  prepMinutes,
  pickupSlots,
  onPickupPlaced,
  onCardReady,
}: {
  cart: CartLine[];
  subtotal: number;
  tax: number;
  total: number;
  open: boolean;
  cardEnabled: boolean;
  cardProvider: "clover" | "stripe" | null;
  payAtPickupLimit: number;
  onBack: () => void;
  onChangeQty: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  canAddMore: (line: CartLine) => boolean;
  phone: string | null;
  prepMinutes: number;
  pickupSlots: PickupSlot[];
  onPickupPlaced: (orderId: string) => void;
  onCardReady: (orderId: string, clientSecret: string, total: number) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [when, setWhen] = useState<"asap" | "later">("asap");
  const [pickupAt, setPickupAt] = useState(pickupSlots[0]?.value ?? "");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const pickupAllowed = total <= payAtPickupLimit;
  const [payment, setPayment] = useState<"card" | "pickup">(cardEnabled ? "card" : "pickup");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);

  const effectivePayment = payment === "pickup" && !pickupAllowed ? "card" : payment;

  // Fill in name and phone from the last order on this phone.
  useEffect(() => {
    const t = setTimeout(() => {
      const saved = load<{ name?: string; phone?: string }>(CONTACT_KEY);
      if (saved?.name) setName((n) => n || String(saved.name).slice(0, 60));
      if (saved?.phone) setPhone((p) => p || String(saved.phone).slice(0, 20));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    store(CONTACT_KEY, { name: name.trim(), phone: phone.trim() });
    startTransition(async () => {
      try {
        const res = await submitOnlineOrder({
          lines: cart.map((l) => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
            modifierIds: l.optionIds,
          })),
          customerName: name,
          customerPhone: phone,
          customerEmail: email,
          notes,
          payment: effectivePayment,
          pickupAt: when === "later" && pickupAt ? pickupAt : null,
          website,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        if (res.kind === "pickup") onPickupPlaced(res.orderId);
        else if (res.kind === "redirect") {
          setLeaving(true);
          window.location.assign(res.href); // Clover's secure payment page
        } else onCardReady(res.orderId, res.clientSecret, res.total);
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
              <li key={l.key} className="py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{l.name}</p>
                    {l.summary && <p className="text-sm leading-snug text-mondy-muted">{l.summary}</p>}
                    <p className="text-sm tabular text-mondy-muted">{formatMoney(l.price)} each</p>
                  </div>
                  <span className="shrink-0 tabular font-semibold">{formatMoney(l.price * l.quantity)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${l.name}`}>
                    <button
                      type="button"
                      onClick={() => onChangeQty(l.key, -1)}
                      aria-label={`One less ${l.name}`}
                      className="grid h-11 w-11 place-items-center rounded-full ring-1 ring-mondy-border hover:bg-mondy-cream focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30"
                    >
                      <Minus className="h-4 w-4" aria-hidden />
                    </button>
                    <span className="w-9 text-center text-lg tabular font-semibold" aria-live="polite">
                      {l.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onChangeQty(l.key, 1)}
                      disabled={!canAddMore(l)}
                      aria-label={`One more ${l.name}`}
                      className="grid h-11 w-11 place-items-center rounded-full ring-1 ring-mondy-border hover:bg-mondy-cream focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30 disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(l.key)}
                    className="flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-mondy-red-dark hover:bg-mondy-red/10 focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Remove<span className="sr-only"> {l.name}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onBack}
            className="mt-3 flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-mondy-red-dark hover:bg-mondy-red/10"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add more items
          </button>

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
              <legend className="font-display text-xl font-black">Pickup time</legend>
              <div className="mt-2 grid gap-2">
                <PayOption
                  name="when"
                  checked={when === "asap"}
                  onChange={() => setWhen("asap")}
                  title="As soon as possible"
                  detail={`Ready in about ${prepMinutes} min`}
                />
                <PayOption
                  name="when"
                  checked={when === "later"}
                  onChange={() => setWhen("later")}
                  disabled={pickupSlots.length === 0}
                  title="Later today"
                  detail={pickupSlots.length ? "Choose a time" : "No later times left today"}
                />
              </div>
              {when === "later" && pickupSlots.length > 0 && (
                <label className="mt-3 block text-sm font-medium">
                  Pickup at
                  <select
                    className={`${field} appearance-auto`}
                    value={pickupAt}
                    onChange={(e) => setPickupAt(e.target.value)}
                    required
                  >
                    {pickupSlots.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </fieldset>

            <fieldset>
              <legend className="font-display text-xl font-black">Payment</legend>
              <div className="mt-2 grid gap-2">
                {cardEnabled && (
                  <PayOption
                    name="payment"
                    checked={effectivePayment === "card"}
                    onChange={() => setPayment("card")}
                    title="Pay now with card"
                    detail={cardProvider === "clover" ? "Secure checkout by Clover" : "Apple Pay, Google Pay, and cards"}
                  />
                )}
                <PayOption
                  name="payment"
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
              disabled={pending || leaving || !open || cart.length === 0}
              className="w-full rounded-2xl bg-mondy-red px-5 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-mondy-red-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30 disabled:opacity-60"
            >
              {leaving
                ? "Opening secure checkout…"
                : pending
                ? "Placing order…"
                : effectivePayment === "card"
                  ? "Continue to payment"
                  : `Place order · ${formatMoney(total)}`}
            </button>

            {restaurantPhone && (
              <p className="text-center text-sm text-mondy-muted">
                Questions about your order? <CallButton phone={restaurantPhone} variant="link" />
              </p>
            )}
          </form>
        </>
      )}
    </main>
  );
}

function PayOption({
  name,
  checked,
  onChange,
  disabled,
  title,
  detail,
}: {
  name: string;
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
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="h-5 w-5 shrink-0 accent-mondy-red"
      />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-mondy-muted">{detail}</span>
      </span>
    </label>
  );
}
