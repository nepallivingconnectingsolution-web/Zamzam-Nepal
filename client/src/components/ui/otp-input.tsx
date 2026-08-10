import * as React from "react";
import { cn } from "@/lib/utils";
import { haptics } from "@/lib/native/haptics";

export interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Boxed numeric OTP input — one box per digit, auto-advance on type,
 * backspace walks back a box, and pasting a full code (e.g. from an SMS/
 * email autofill suggestion) fills every box at once. Digits render in
 * JetBrains Mono for the "typeset, not typed" feel money/codes should have.
 */
export function OTPInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
  error,
  autoFocus,
  className,
}: OTPInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);
  const digits = React.useMemo(() => {
    const arr = value.split("").slice(0, length);
    while (arr.length < length) arr.push("");
    return arr;
  }, [value, length]);

  function setDigit(index: number, digit: string) {
    const next = [...digits];
    next[index] = digit;
    const joined = next.join("");
    onChange(joined);
    if (joined.length === length && !joined.includes("")) onComplete?.(joined);
  }

  function handleChange(index: number, raw: string) {
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      setDigit(index, "");
      return;
    }
    // Typing (or an autofill keystroke) may deliver more than one digit at
    // once — spread it across the remaining boxes starting here.
    const chars = clean.split("");
    chars.forEach((ch, i) => {
      const target = index + i;
      if (target < length) setDigit(target, ch);
    });
    const targetIndex = Math.min(index + chars.length, length - 1);
    refs.current[targetIndex]?.focus();
    void haptics.selectionChanged();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
      setDigit(index - 1, "");
    }
    if (e.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    if (pasted.length === length) onComplete?.(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div className={cn("flex justify-between gap-2", className)} role="group" aria-label="One-time code">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-14 w-full max-w-14 flex-1 rounded-xl border bg-surface text-center font-mono text-xl font-semibold tabular-nums text-fg transition-all duration-fast",
            "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15",
            error ? "border-danger focus-visible:border-danger" : "border-input focus-visible:border-accent",
            disabled && "opacity-50",
          )}
        />
      ))}
    </div>
  );
}
