import { cn } from "@/lib/utils";

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

/** Pure scoring function — exported so forms can gate submit on it without re-deriving. */
export function scorePassword(password: string): PasswordStrength {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4) as PasswordStrength;
}

const LABEL: Record<PasswordStrength, string> = {
  0: "Too short",
  1: "Weak",
  2: "Okay",
  3: "Good",
  4: "Strong",
};

const COLOR: Record<PasswordStrength, string> = {
  0: "bg-danger",
  1: "bg-danger",
  2: "bg-warning",
  3: "bg-brand-500",
  4: "bg-success",
};

export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = scorePassword(password);
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-base",
                i < strength ? COLOR[strength] : "bg-transparent",
              )}
            />
          </div>
        ))}
      </div>
      {password && (
        <p className={cn("text-xs font-medium", strength <= 1 ? "text-danger" : "text-muted-fg")}>
          {LABEL[strength]}
        </p>
      )}
    </div>
  );
}
