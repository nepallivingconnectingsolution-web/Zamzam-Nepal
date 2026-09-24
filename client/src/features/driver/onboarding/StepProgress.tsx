import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const STEPS = ["Phone", "Personal", "Licence", "Vehicle", "Documents", "Review"] as const;

/**
 * Where the driver is in the six steps. On a phone it is one line plus a bar
 * (labels for six steps don't fit); from `sm` up every step is named.
 */
export function StepProgress({ step, onJump }: { step: number; onJump?: (i: number) => void }) {
  return (
    <nav aria-label="Application progress">
      <div className="sm:hidden">
        <p className="text-sm font-semibold">
          Step {step + 1} of {STEPS.length} <span className="font-normal text-muted-fg">· {STEPS[step]}</span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}>
          <div className="h-full rounded-full bg-teal-700 transition-[width] duration-base ease-standard dark:bg-accent" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <ol className="hidden items-center sm:flex">
        {STEPS.map((label, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={label} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
              <button
                type="button"
                onClick={() => done && onJump?.(i)}
                disabled={!done}
                aria-current={current ? "step" : undefined}
                className="flex items-center gap-2 disabled:cursor-default"
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors duration-fast",
                    done && "bg-teal-700 text-white dark:bg-accent dark:text-amber-fg",
                    current && "border-2 border-teal-700 text-teal-700 dark:border-accent dark:text-accent",
                    !done && !current && "border border-border text-muted-fg",
                  )}
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={cn("text-sm", current ? "font-semibold" : "text-muted-fg")}>{label}</span>
              </button>
              {i < STEPS.length - 1 && <span className={cn("mx-3 h-px flex-1", done ? "bg-teal-700 dark:bg-accent" : "bg-border")} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
