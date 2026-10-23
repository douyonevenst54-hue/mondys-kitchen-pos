import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  SquareError,
  cancelTerminalCheckout,
  createTerminalCheckout,
  getSquarePayment,
  getTerminalCheckout,
  refundSquarePayment,
  squareCardBrand,
  squarePaidCents,
  squareStatus,
  type TerminalCheckout,
} from "@/lib/square";

/**
 * Card payments at the register (and for pay-at-pickup orders) on the
 * register's Square Terminal. The cashier taps Card, the amount appears on the
 * Terminal, the customer pays, and the sale is saved only after Square shows
 * that exact checkout completed for that exact amount. Each Square payment
 * can pay for one sale only.
 */

export { SquareError };

const REF_PREFIX = "pos-";
const MAX_AGE_MS = 30 * 60_000;

export type RegisterSquare = {
  /** Square is set up and a Terminal is paired for the register. */
  ready: boolean;
  enabled: boolean;
  sandbox: boolean;
  problem: string | null;
  deviceId: string | null;
  deviceName: string | null;
};

export async function registerSquareInfo(): Promise<RegisterSquare> {
  const st = squareStatus();
  const s = await prisma.restaurantSettings.findFirst({ select: { registerSquareDeviceId: true, registerSquareDeviceName: true } });
  const deviceId = s?.registerSquareDeviceId ?? null;
  return {
    ready: st.enabled && Boolean(deviceId),
    enabled: st.enabled,
    sandbox: st.sandbox,
    problem: st.problem,
    deviceId,
    deviceName: s?.registerSquareDeviceName ?? null,
  };
}

/** Show the amount on the register's Square Terminal. */
export async function startRegisterCharge(a: { amountCents: number; manual: boolean; note: string }): Promise<TerminalCheckout> {
  const info = await registerSquareInfo();
  if (!info.ready || !info.deviceId) throw new SquareError("No Square Terminal is paired for the register");
  if (!Number.isInteger(a.amountCents) || a.amountCents < 1 || a.amountCents > 10_000_000) throw new SquareError("Invalid amount");
  const key = randomUUID();
  return createTerminalCheckout({
    amountCents: a.amountCents,
    deviceId: info.deviceId,
    referenceId: `${REF_PREFIX}${key.slice(0, 30)}`,
    note: a.note,
    idempotencyKey: key,
    manualEntry: a.manual,
  });
}

export type ChargeState =
  | { state: "waiting" }
  | { state: "paid"; card: string | null }
  | { state: "canceled"; message: string };

const cancelMessage = (reason?: string) =>
  reason === "TIMED_OUT"
    ? "The Square Terminal timed out. No money was taken."
    : reason === "BUYER_CANCELED"
      ? "The customer cancelled on the Terminal. No money was taken."
      : "The payment was cancelled. No money was taken.";

async function ours(checkoutId: string): Promise<TerminalCheckout> {
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(checkoutId)) throw new SquareError("Invalid checkout");
  const co = await getTerminalCheckout(checkoutId).catch((e) => {
    if (e instanceof SquareError) throw new SquareError("Square couldn't find that payment");
    throw e;
  });
  if (!co.reference_id?.startsWith(REF_PREFIX)) throw new SquareError("That isn't a register payment");
  return co;
}

const cardLabel = (brand: string | null, last4: string | null) => (last4 ? `${brand ?? "Card"} •••• ${last4}` : brand);

export async function readRegisterCharge(checkoutId: string): Promise<ChargeState> {
  const co = await ours(checkoutId);
  if (co.status === "COMPLETED" && co.payment_ids?.[0]) {
    const p = await getSquarePayment(co.payment_ids[0]);
    return { state: "paid", card: cardLabel(squareCardBrand(p), p.card_details?.card?.last_4 ?? null) };
  }
  if (co.status === "CANCELED") return { state: "canceled", message: cancelMessage(co.cancel_reason) };
  return { state: "waiting" };
}

/**
 * Take the amount off the Terminal. Only reports "canceled" once Square says
 * so; if the customer already paid, that's what comes back.
 */
export async function cancelRegisterCharge(checkoutId: string): Promise<ChargeState> {
  await ours(checkoutId);
  try {
    await cancelTerminalCheckout(checkoutId);
  } catch (e) {
    // Square refuses to cancel a checkout that already finished: fall through and read it.
    console.warn("Square cancel:", e instanceof Error ? e.message : e);
  }
  const now = await readRegisterCharge(checkoutId);
  if (now.state === "canceled") return { state: "canceled", message: "Cancelled. No money was taken." };
  return now; // "paid", or still "waiting" (cancel not confirmed yet)
}

/** Payment rows that already hold this Square payment ("square:<id>", alone or after "|"). */
export const squareRefWhere = (ref: string) => ({ OR: [{ processorRef: ref }, { processorRef: { endsWith: `|${ref}` } }] });

async function usedBySale(paymentId: string): Promise<boolean> {
  return Boolean(await prisma.payment.findFirst({ where: squareRefWhere(`square:${paymentId}`), select: { id: true } }));
}

/** Right before the sale is saved: the checkout is ours, paid, for this exact total, and not used yet. */
export async function verifyRegisterCharge(
  checkoutId: string,
  totalCents: number,
): Promise<{ ok: true; ref: string; last4: string | null; brand: string | null } | { ok: false; error: string }> {
  try {
    const co = await ours(checkoutId);
    if (co.status !== "COMPLETED" || !co.payment_ids?.[0]) return { ok: false, error: "Square hasn't approved this payment yet" };
    if (co.amount_money.amount !== totalCents) return { ok: false, error: "The Square payment amount doesn't match this sale" };
    if (co.created_at && Date.now() - Date.parse(co.created_at) > MAX_AGE_MS) {
      return { ok: false, error: "That Square payment is too old for this sale" };
    }
    const p = await getSquarePayment(co.payment_ids[0]);
    if (p.status !== "COMPLETED" && p.status !== "APPROVED") return { ok: false, error: "Square shows this payment as not approved" };
    if (squarePaidCents(p) !== totalCents) return { ok: false, error: "The Square payment amount doesn't match this sale" };
    if (await usedBySale(p.id)) return { ok: false, error: "That Square payment was already used for another sale" };
    return { ok: true, ref: `square:${p.id}`, last4: p.card_details?.card?.last_4 ?? null, brand: squareCardBrand(p) };
  } catch (e) {
    if (e instanceof SquareError) return { ok: false, error: e.message };
    console.error("Square check failed:", e);
    return { ok: false, error: "Couldn't reach Square to check the payment. Try again." };
  }
}

/**
 * The card was charged but the sale couldn't be saved (for example, an item
 * sold out meanwhile) and the cashier backs out: give the money back.
 */
export async function refundUnusedCharge(checkoutId: string): Promise<void> {
  const co = await ours(checkoutId);
  const pid = co.payment_ids?.[0];
  if (co.status !== "COMPLETED" || !pid) return; // nothing was taken
  if (await usedBySale(pid)) throw new SquareError("This payment belongs to a saved sale. Void that sale to refund it.");
  await refundSquarePayment(pid, co.amount_money.amount, "Sale not completed on the register");
}
