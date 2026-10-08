import { Wordmark } from "@/components/brand/Wordmark";
import { PinKeypad } from "@/components/login/PinKeypad";

type SearchParams = Promise<{ reason?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { reason } = await searchParams;
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-mondy-cream text-mondy-ink">
      <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
        {/* Brand side — set like the printed menu's masthead */}
        <section className="flex flex-1 flex-col items-center justify-center px-8 pt-14 pb-8 lg:pt-24 lg:pb-24">
          <div className="flex w-full max-w-md flex-col items-center text-center animate-rise">
            <Wordmark size="xl" />
            <span aria-hidden className="mt-6 h-px w-full max-w-xs bg-mondy-red" />
            <p className="mt-4 font-sans text-sm font-semibold text-mondy-red-dark sm:text-base">
              Breakfast · Bowls · Grill · Coffee · Smoothies
            </p>
          </div>
        </section>

        {/* Keypad side */}
        <section className="flex flex-1 items-start justify-center px-6 pb-12 lg:items-center lg:pb-0">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl ring-1 ring-mondy-border animate-rise-delayed sm:p-8">
            <header className="mb-5 text-center">
              <p className="font-sans text-sm font-semibold text-mondy-red-dark">
                Staff sign in
              </p>
              <p className="mt-1 font-display text-lg text-mondy-ink">
                Enter your PIN
              </p>
              {reason === "idle" && (
                <p role="status" className="mt-3 rounded-xl bg-mondy-cream px-3 py-2 font-sans text-sm text-mondy-ink">
                  You were signed out because the screen wasn&apos;t used for a few minutes.
                </p>
              )}
            </header>
            <PinKeypad />
          </div>
        </section>
      </div>

      {/* Local animations + shake-on-error keyframes */}
      <style>{`
        @keyframes rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-rise {
          animation: rise 0.7s var(--ease-mondy, ease-out) both;
        }
        .animate-rise-delayed {
          animation: rise 0.7s var(--ease-mondy, ease-out) both;
          animation-delay: 0.15s;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .animate-shake {
          animation: shake 0.4s var(--ease-mondy, ease-out);
        }
      `}</style>
    </main>
  );
}
