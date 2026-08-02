import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "REQUESTED", label: "Requested" },
  { key: "ACCEPTED", label: "Driver assigned" },
  { key: "ONGOING", label: "On trip" },
  { key: "PAYMENT_PENDING", label: "Payment" },
] as const;

/**
 * Uber-style horizontal progress bar across a ride's lifecycle. Purely
 * presentational — it reads whatever `status` the polling hooks already
 * return (GET /rides/active, GET /rides/current), no extra fetching of its
 * own. Shared between the customer's ServiceBookingPage and the driver's
 * CurrentTripPage so both sides of the same trip see identical stages,
 * instead of the plain status-text-plus-badge either page had before.
 */
export function TripStatusStepper({ status }: { status: string }) {
  const currentIndex = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const done = status === "COMPLETED" || currentIndex > i;
        const active = i === currentIndex;
        return (
          <div key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border text-[10px] font-semibold transition-colors",
                  done
                    ? "border-accent bg-accent text-white"
                    : active
                      ? "border-accent text-accent"
                      : "border-border text-muted-fg",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  "hidden text-center text-[10px] leading-tight sm:block",
                  done || active ? "font-medium text-fg" : "text-muted-fg",
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn("mx-1 h-0.5 flex-1 rounded-full transition-colors", done ? "bg-accent" : "bg-border")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}