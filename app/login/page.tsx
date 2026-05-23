import { MondysLogo } from "@/components/login/MondysLogo";
import { PinKeypad } from "@/components/login/PinKeypad";

export default function LoginPage() {
  return (
    <main className="min-h-screen w-full bg-mondy-yellow relative overflow-hidden">
      {/* Background gradient — mimics the brand asset's left-to-right warming */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-mondy-yellow-soft via-mondy-yellow to-mondy-yellow-deep"
      />
      {/* Soft red corner glow — echoes the brand asset's bottom-right warmth */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-[60vh] w-[60vh] translate-x-1/3 translate-y-1/3 rounded-full bg-mondy-red-dark/40 blur-3xl"
      />
      {/* Slim red bottom band — anchors the page like a plate's edge */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 bg-gradient-to-r from-mondy-red-dark/0 via-mondy-red-dark/70 to-mondy-red-dark/0"
      />
      {/* Grain texture for warmth (CSS-only noise) */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.08] mix-blend-multiply pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
        {/* Brand side — top on mobile/tablet, left on desktop */}
        <section className="flex flex-1 flex-col items-center justify-center px-8 pt-14 pb-8 lg:pt-24 lg:pb-24">
          <div className="flex flex-col items-center text-center text-mondy-red animate-rise">
            <MondysLogo className="text-mondy-red drop-shadow-sm" size={72} />
            <h1 className="mt-4 font-display text-6xl font-black tracking-tight leading-[0.95] sm:text-7xl">
              MONDY&apos;S
            </h1>
            <h2 className="mt-1 font-sans text-2xl font-semibold tracking-[0.32em] text-mondy-red-dark sm:text-3xl">
              KITCHEN
            </h2>
            <div className="mt-6 flex items-center gap-3">
              <span className="h-px w-10 bg-mondy-red-dark/40" aria-hidden />
              <p className="font-display italic text-base font-light tracking-wide text-mondy-ink/80 sm:text-lg">
                Authentic Haitian Cuisine
              </p>
              <span className="h-px w-10 bg-mondy-red-dark/40" aria-hidden />
            </div>
          </div>
        </section>

        {/* Keypad side */}
        <section className="flex flex-1 items-start justify-center px-6 pb-12 lg:items-center lg:pb-0">
          <div className="w-full max-w-sm rounded-3xl bg-white/85 p-6 backdrop-blur-md ring-1 ring-white/60 shadow-2xl animate-rise-delayed sm:p-8">
            <header className="mb-5 text-center">
              <p className="font-sans text-xs font-medium uppercase tracking-[0.24em] text-mondy-red-dark">
                Staff Sign In
              </p>
              <p className="mt-1 font-display text-lg text-mondy-ink">
                Enter your PIN
              </p>
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
