import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/menu";
import { getBrand } from "@/lib/brand";
import { PolicyPage, POLICY_UPDATED } from "@/components/online/PolicyPage";

export const metadata: Metadata = { title: "Terms" };

export default async function TermsPage() {
  const [s, brand] = await Promise.all([getSettings(), getBrand()]);
  const reward = `${s.loyaltyRewardPoints} points = $${s.loyaltyRewardValue.toFixed(2)} off`;
  return (
    <PolicyPage title="Terms of ordering" updated={POLICY_UPDATED}>
      <p>By ordering from {brand.name} online, you agree to these terms.</p>

      <h2>Orders and pickup</h2>
      <ul>
        <li>Online orders are for pickup at {s.address || "our restaurant"}. Pickup times are estimates.</li>
        <li>Prices and the menu can change. The price you see at checkout is the price you pay, plus meals tax.</li>
        <li>If a dish runs out after you order, we&apos;ll call you to swap it or refund it.</li>
        <li>Please tell us about food allergies when you order. Our kitchen handles common allergens.</li>
      </ul>

      <h2>Payment, cancellations and refunds</h2>
      <ul>
        <li>Card payments are processed securely by our payment provider.</li>
        <li>To cancel, call us{s.phone ? ` at ${s.phone}` : ""} before we start cooking. Cancelled paid orders are refunded to your card.</li>
        <li>Refunds usually appear on your statement within 5 to 10 business days.</li>
      </ul>

      {s.loyaltyEnabled && (
        <>
          <h2>{brand.rewardsName}</h2>
          <ul>
            <li>
              Earn {s.loyaltyPointsPerDollar} point{s.loyaltyPointsPerDollar === 1 ? "" : "s"} per $1 spent on food (after
              discounts, before tax and tip) once your order is paid and picked up. {reward}.
            </li>
            <li>Points are tied to your phone number, have no cash value, and can&apos;t be transferred.</li>
            <li>Points from cancelled or refunded orders are removed. We may change or end the program with notice on this page.</li>
          </ul>
        </>
      )}

      <h2>Promo codes</h2>
      <p>Promo codes follow the conditions shown with them (dates, minimum order, limits) and can&apos;t be exchanged for cash.</p>

      <h2 id="sms">Text message terms</h2>
      <ul>
        <li>
          Program: {brand.name} order updates. If you tick &ldquo;Text me&rdquo; at checkout, you&apos;ll get texts about
          that order only (ready for pickup, cancelled).
        </li>
        <li>Message frequency varies, usually 1 to 2 messages per order.</li>
        <li>Message and data rates may apply.</li>
        <li>Reply STOP to cancel at any time. Reply HELP for help, or call us{s.phone ? ` at ${s.phone}` : ""}.</li>
        <li>Carriers are not liable for delayed or undelivered messages.</li>
        <li>
          See our <Link href="/order/privacy">privacy policy</Link>. Phone numbers and consent are never shared with third
          parties for marketing.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions? <Link href="/order/contact">Contact us</Link>
        {s.phone ? ` or call ${s.phone}` : ""}.
      </p>
    </PolicyPage>
  );
}
