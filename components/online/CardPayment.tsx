"use client";

import { useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Lock } from "lucide-react";
import { formatMoney } from "@/lib/money";

let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise() {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
  }
  return stripePromise;
}

export function CardPayment({
  clientSecret,
  orderId,
  total,
}: {
  clientSecret: string;
  orderId: string;
  total: number;
}) {
  return (
    <Elements
      stripe={getStripePromise()}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#c8202e",
            colorText: "#1a1410",
            colorTextSecondary: "#8b7e6f",
            colorBackground: "#ffffff",
            borderRadius: "12px",
            fontFamily: "DM Sans, system-ui, sans-serif",
          },
        },
      }}
    >
      <PayForm orderId={orderId} total={total} />
    </Elements>
  );
}

function PayForm({ orderId, total }: { orderId: string; total: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pay() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order/status/${orderId}`,
      },
    });
    // Only reached if the payment failed or needs fixing; success redirects.
    if (stripeError) {
      setError(stripeError.message ?? "Your card couldn't be charged. Try another card.");
    }
    setSubmitting(false);
  }

  return (
    <div>
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-mondy-red/10 px-3 py-2 text-sm text-mondy-red-dark">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={pay}
        disabled={!stripe || submitting}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-mondy-red px-5 py-4 text-base font-semibold text-white transition hover:bg-mondy-red-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-mondy-red/30 disabled:opacity-60"
      >
        <Lock className="h-4 w-4" aria-hidden />
        {submitting ? "Paying…" : `Pay ${formatMoney(total)}`}
      </button>
      <p className="mt-2 text-center text-xs text-mondy-muted">
        Card details go straight to Stripe. Rosewood Cafe never sees your card number.
      </p>
    </div>
  );
}
