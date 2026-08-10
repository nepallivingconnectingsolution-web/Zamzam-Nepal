import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Dial codes for the markets Zamzam serves plus the ones its users most
 * commonly travel from. Nepal first because it's the default market.
 */
export const DIAL_CODES = [
  { code: "+977", label: "🇳🇵 +977", digits: 10 },
  { code: "+91", label: "🇮🇳 +91", digits: 10 },
  { code: "+880", label: "🇧🇩 +880", digits: 10 },
  { code: "+86", label: "🇨🇳 +86", digits: 11 },
  { code: "+971", label: "🇦🇪 +971", digits: 9 },
  { code: "+974", label: "🇶🇦 +974", digits: 8 },
  { code: "+60", label: "🇲🇾 +60", digits: 9 },
  { code: "+44", label: "🇬🇧 +44", digits: 10 },
  { code: "+1", label: "🇺🇸 +1", digits: 10 },
] as const;

const DEFAULT_DIAL = "+977";

/** Splits a stored value like "+9779812345678" into its dial code and national part. */
export function splitPhone(value: string): { dial: string; national: string } {
  const trimmed = (value ?? "").replace(/\s+/g, "");
  // Longest dial code first so "+977" wins over "+97"/"+9".
  const match = [...DIAL_CODES]
    .sort((a, b) => b.code.length - a.code.length)
    .find((c) => trimmed.startsWith(c.code));
  if (match) return { dial: match.code, national: trimmed.slice(match.code.length) };
  return { dial: DEFAULT_DIAL, national: trimmed.replace(/\D/g, "") };
}

/** How many national digits the chosen country expects. */
export function expectedDigits(dial: string): number {
  return DIAL_CODES.find((c) => c.code === dial)?.digits ?? 10;
}

/** True when the value is a complete number for its country. */
export function isValidPhone(value: string): boolean {
  const { dial, national } = splitPhone(value);
  return national.length === expectedDigits(dial);
}

export interface PhoneFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  /** Show the "needs N digits" hint once the user has started typing. */
  showError?: boolean;
  className?: string;
  id?: string;
}

/**
 * Phone entry with an explicit country code.
 *
 * The plain <Input> these replaced accepted literally anything — letters,
 * symbols, a two-digit number — because neither the field nor the server DTO
 * checked the format. This keeps the national part strictly numeric, caps it
 * at the country's real length, and reports validity so callers can block
 * submission.
 */
export function PhoneField({
  value,
  onChange,
  label,
  showError,
  className,
  id,
}: PhoneFieldProps) {
  const { dial, national } = splitPhone(value);
  const need = expectedDigits(dial);
  const invalid = !!showError && national.length > 0 && national.length !== need;

  function setDial(nextDial: string) {
    // Re-clamp when switching country: +971 wants 9 digits, +977 wants 10.
    onChange(nextDial + national.slice(0, expectedDigits(nextDial)));
  }

  function setNational(raw: string) {
    onChange(dial + raw.replace(/\D/g, "").slice(0, need));
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={id} className="text-body-sm font-medium text-muted-fg">
          {label}
        </label>
      )}
      <div
        className={cn(
          "flex h-11 w-full overflow-hidden rounded-md border bg-surface transition-colors duration-fast ease-standard",
          invalid ? "border-error" : "border-input focus-within:border-teal-700 dark:focus-within:border-accent",
        )}
      >
        <select
          aria-label="Country code"
          value={dial}
          onChange={(e) => setDial(e.target.value)}
          className="h-full shrink-0 border-r border-input bg-surface-2 px-2 text-body text-fg outline-none"
        >
          {DIAL_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={national}
          onChange={(e) => setNational(e.target.value)}
          placeholder={"0".repeat(need)}
          aria-invalid={invalid || undefined}
          className="h-full min-w-0 flex-1 bg-surface px-3 font-tabular text-body text-fg outline-none placeholder:text-muted-fg"
        />
      </div>
      {invalid && (
        <p className="text-caption text-error">
          Enter {need} digits after {dial} — you have {national.length}.
        </p>
      )}
    </div>
  );
}

/**
 * Name entry that refuses digits.
 *
 * Same reason as above: these were plain text inputs, so a phone number in
 * the name box submitted happily.
 */
export const NameInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
    value: string;
    onChange: (value: string) => void;
    error?: boolean;
  }
>(({ className, value, onChange, error, ...props }, ref) => (
  <input
    ref={ref}
    type="text"
    autoComplete="name"
    value={value}
    // Letters, spaces, hyphens and apostrophes only — covers "Sita",
    // "Ram Bahadur", "D'Souza", "Shrestha-Rai" and rejects digits.
    onChange={(e) => onChange(e.target.value.replace(/[^\p{L}\s'-]/gu, ""))}
    aria-invalid={error || undefined}
    className={cn(
      "flex h-11 w-full rounded-md border bg-surface px-3.5 text-body text-fg",
      "placeholder:text-muted-fg transition-colors duration-fast ease-standard",
      "focus-visible:outline-none disabled:opacity-40",
      error
        ? "border-error"
        : "border-input focus-visible:border-teal-700 dark:focus-visible:border-accent",
      className,
    )}
    {...props}
  />
));
NameInput.displayName = "NameInput";
