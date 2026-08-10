import * as React from "react";
import { Clock, Minus, Plus } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { haptics } from "@/lib/native/haptics";

function parse24(hhmm: string): { hour12: number; minute: number; period: "AM" | "PM" } {
  if (!hhmm) return { hour12: 9, minute: 0, period: "AM" };
  const [h, m] = hhmm.split(":").map(Number);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute: m || 0, period };
}

function to24(hour12: number, minute: number, period: "AM" | "PM"): string {
  let h = hour12 % 12;
  if (period === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatLabel(hhmm: string): string {
  if (!hhmm) return "Select time";
  const { hour12, minute, period } = parse24(hhmm);
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export interface TimeFieldProps {
  label: string;
  value: string; // "HH:MM", 24h — same shape a native <input type="time"> gives
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Bottom-sheet time picker — the mobile-native replacement for
 * `<input type="time">`. Value/onChange use the same 24h "HH:MM" string
 * shape a native time input would, so it's a drop-in swap.
 */
export function TimeField({ label, value, onChange, className }: TimeFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(() => parse24(value));

  React.useEffect(() => {
    if (open) setDraft(parse24(value));
  }, [open, value]);

  function step(field: "hour12" | "minute", delta: number) {
    void haptics.selectionChanged();
    setDraft((d) => {
      if (field === "hour12") {
        let next = d.hour12 + delta;
        if (next > 12) next = 1;
        if (next < 1) next = 12;
        return { ...d, hour12: next };
      }
      let next = d.minute + delta;
      if (next >= 60) next = 0;
      if (next < 0) next = 55;
      return { ...d, minute: next };
    });
  }

  function confirm() {
    onChange(to24(draft.hour12, draft.minute, draft.period));
    setOpen(false);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-xs font-medium text-muted-fg">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center gap-2 rounded-xl border border-input bg-surface px-3.5 text-left text-sm text-fg transition-colors active:bg-surface-2"
      >
        <Clock className="size-4 shrink-0 text-muted-fg" />
        <span className={cn("font-tabular truncate", !value && "text-muted-fg")}>{formatLabel(value)}</span>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="space-y-5 pb-2">
          <div className="flex items-center justify-center gap-3">
            <Stepper value={draft.hour12} onDec={() => step("hour12", -1)} onInc={() => step("hour12", 1)} />
            <span className="font-tabular text-3xl font-bold text-muted-fg">:</span>
            <Stepper value={draft.minute} pad onDec={() => step("minute", -5)} onInc={() => step("minute", 5)} />
          </div>
          <SegmentedControl
            options={[
              { value: "AM", label: "AM" },
              { value: "PM", label: "PM" },
            ]}
            value={draft.period}
            onChange={(period) => setDraft((d) => ({ ...d, period }))}
          />
          <button
            type="button"
            onClick={confirm}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-accent-fg active:scale-[0.98]"
          >
            Set time
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

function Stepper({ value, pad, onDec, onInc }: { value: number; pad?: boolean; onDec: () => void; onInc: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onInc}
        aria-label="Increase"
        className="grid size-9 place-items-center rounded-full bg-surface-2 text-fg transition-transform active:scale-90"
      >
        <Plus className="size-4" />
      </button>
      <span className="font-tabular w-12 text-center text-3xl font-bold">{pad ? String(value).padStart(2, "0") : value}</span>
      <button
        type="button"
        onClick={onDec}
        aria-label="Decrease"
        className="grid size-9 place-items-center rounded-full bg-surface-2 text-fg transition-transform active:scale-90"
      >
        <Minus className="size-4" />
      </button>
    </div>
  );
}
