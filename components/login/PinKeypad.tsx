"use client";

import { useState, useTransition } from "react";
import { Delete } from "lucide-react";
import { loginWithPin } from "@/app/login/actions";

const MAX_PIN_LENGTH = 6;

export function PinKeypad() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDigit(digit: string) {
    if (isPending) return;
    setError(null);
    setPin((p) => (p.length >= MAX_PIN_LENGTH ? p : p + digit));
  }

  function handleBackspace() {
    if (isPending) return;
    setError(null);
    setPin((p) => p.slice(0, -1));
  }

  function handleClear() {
    if (isPending) return;
    setError(null);
    setPin("");
  }

  function handleSubmit() {
    if (pin.length < 4) {
      setError("Enter at least 4 digits");
      return;
    }
    const formData = new FormData();
    formData.append("pin", pin);
    startTransition(async () => {
      const result = await loginWithPin(formData);
      // If server returned ok:false, show the error.
      // (On success the action redirects, so this branch only runs on failure.)
      if (result && !result.ok) {
        setError(result.error);
        setPin("");
      }
    });
  }

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="w-full max-w-sm">
      {/* PIN dots display */}
      <div
        className={`mb-6 flex h-16 items-center justify-center gap-3 rounded-2xl bg-white/95 px-6 shadow-sm ring-1 ring-mondy-border ${
          error ? "ring-2 ring-mondy-red animate-shake" : ""
        }`}
        aria-live="polite"
      >
        {Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => {
          const filled = i < pin.length;
          return (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full transition-all duration-200 ${
                filled
                  ? "bg-mondy-red scale-110"
                  : "bg-mondy-border scale-90"
              }`}
              aria-hidden
            />
          );
        })}
      </div>

      {/* Error message — fixed height so layout doesn't jump */}
      <div className="mb-3 flex h-5 items-center justify-center text-sm font-medium text-mondy-red-dark">
        {error}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3">
        {digits.map((d) => (
          <KeypadButton
            key={d}
            onClick={() => handleDigit(d)}
            disabled={isPending}
          >
            {d}
          </KeypadButton>
        ))}
        <KeypadButton
          onClick={handleClear}
          variant="muted"
          disabled={isPending || pin.length === 0}
          aria-label="Clear PIN"
        >
          <span className="text-base font-medium tracking-wide">CLR</span>
        </KeypadButton>
        <KeypadButton onClick={() => handleDigit("0")} disabled={isPending}>
          0
        </KeypadButton>
        <KeypadButton
          onClick={handleBackspace}
          variant="muted"
          disabled={isPending || pin.length === 0}
          aria-label="Backspace"
        >
          <Delete className="h-6 w-6" />
        </KeypadButton>
      </div>

      {/* Enter button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || pin.length < 4}
        className="mt-5 h-14 w-full rounded-2xl bg-mondy-red text-lg font-medium tracking-wide text-white shadow-md ring-1 ring-mondy-red-dark/20 transition-all duration-200 ease-mondy hover:bg-mondy-red-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-mondy-muted/40 disabled:text-white/70 disabled:shadow-none"
      >
        {isPending ? "Signing in…" : "Enter"}
      </button>
    </div>
  );
}

type KeypadButtonProps = {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "muted";
  "aria-label"?: string;
};

function KeypadButton({
  children,
  onClick,
  disabled,
  variant = "default",
  ...rest
}: KeypadButtonProps) {
  const base =
    "h-16 rounded-2xl font-display text-2xl tabular flex items-center justify-center transition-all duration-200 ease-mondy active:scale-[0.94] disabled:opacity-40 disabled:cursor-not-allowed";
  const styles =
    variant === "muted"
      ? "bg-mondy-cream text-mondy-muted ring-1 ring-mondy-border hover:bg-white hover:text-mondy-ink"
      : "bg-white text-mondy-ink ring-1 ring-mondy-border shadow-sm hover:ring-mondy-red/40 hover:text-mondy-red";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles}`}
      {...rest}
    >
      {children}
    </button>
  );
}
