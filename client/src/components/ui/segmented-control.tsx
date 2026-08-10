import { useId } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { haptics } from "@/lib/native/haptics";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * iOS-style segmented control — replaces raw <select>/radio groups for
 * short, mutually-exclusive choices (role picker, date-range toggle, ride
 * class). The active pill is a single shared `layoutId` element that
 * slides between segments rather than each segment re-rendering its own
 * background.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const layoutId = useId();
  return (
    <div
      role="tablist"
      className={cn("relative inline-flex w-full items-center gap-0.5 rounded-xl bg-surface-2 p-1", className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) void haptics.selectionChanged();
              onChange(opt.value);
            }}
            className={cn(
              "relative z-0 flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-fast",
              active ? "text-fg" : "text-muted-fg",
            )}
          >
            {active && (
              <motion.span
                layoutId={`segmented-control-thumb-${layoutId}`}
                transition={{ type: "spring", damping: 28, stiffness: 340 }}
                className="absolute inset-0 -z-10 rounded-lg bg-card shadow-e1"
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
