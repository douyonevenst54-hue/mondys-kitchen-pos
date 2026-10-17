import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/menu";
import { getBrand } from "@/lib/brand";
import { smsStatus } from "@/lib/notify";
import { PolicyPage, POLICY_UPDATED } from "@/components/online/PolicyPage";

export const metadata: Metadata = { title: "Privacy policy" };

export default async function PrivacyPage() {
  const [s, brand] = await Promise.all([getSettings(), getBrand()]);
  const contact = [s.email, s.phone].filter(Boolean).join(" or ");
  return (
    <PolicyPage title="Privacy policy" updated={POLICY_UPDATED}>
      <p>
        This policy explains what {brand.name} (&ldquo;we&rdquo;) collects when you order online, sign up for{" "}
        {brand.rewardsName}, or contact us, and how we use it. We keep it short and we don&apos;t sell your information.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your name and phone number, to prepare your order and reach you about it.</li>
        <li>Your email address, if you give one, to send order updates.</li>
        <li>What you ordered, when, and how you paid (card type and last 4 digits only).</li>
        <li>Your rewards points, if you give your phone number.</li>
        <li>Messages you send us through the contact, catering or feedback forms.</li>
        <li>Basic technical data (like your IP address) to keep the site secure and stop spam.</li>
      </ul>

      <h2>Card payments</h2>
      <p>
        Card details are entered on our payment provider&apos;s secure form (Clover or Stripe). We never see or store your
        full card number.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To make your order, tell you when it&apos;s ready, and answer your questions.</li>
        <li>To keep track of rewards points and promo codes.</li>
        <li>For our own bookkeeping and taxes.</li>
        <li>
          To email you specials and news, <strong>only if you ticked the box</strong>. Every email has an unsubscribe link.
        </li>
      </ul>

      {smsStatus().enabled && (
        <>
          <h2>Text messages</h2>
          <p>
            If you ask for texts at checkout, we use your number only for updates about that order (ready for pickup,
            cancelled). See the <Link href="/order/terms#sms">text message terms</Link>. Reply STOP to stop, HELP for help.
            Your phone number and text consent are never shared with or sold to anyone for marketing.
          </p>
        </>
      )}

      <h2>Who we share it with</h2>
      <p>
        Only the services that help us run orders: our payment processor, our email and text message providers, and our
        hosting and database providers. They may use it only to provide their service to us. We may also share information
        if the law requires it.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Order and payment records are kept as long as tax and bookkeeping rules require. You can ask us to delete your
        rewards account and contact details at any time.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Unsubscribe from specials with the link in any email.</li>
        <li>Reply STOP to any text to stop texts.</li>
        <li>Ask us what we have about you, or to correct or delete it{contact ? `: ${contact}` : ""}.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        {brand.name}
        {s.address ? `, ${s.address}` : ""}
        {contact ? `. ${contact}.` : "."}
      </p>
    </PolicyPage>
  );
}
