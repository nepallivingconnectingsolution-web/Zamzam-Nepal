import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/utils";
import { haptics } from "@/lib/native/haptics";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromIso(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatLabel(iso: string): string {
  const d = fromIso(iso);
  if (!d) return "Select date";
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export interface DateFieldProps {
  label: string;
  value: string; // "YYYY-MM-DD", same shape a native <input type="date"> gives
  onChange: (value: string) => void;
  /** ISO date string — days before this are disabled. Defaults to today. */
  minDate?: string;
  className?: string;
}

/**
 * Bottom-sheet calendar picker — the mobile-native replacement for
 * `<input type="date">`, which renders inconsistent OS chrome across
 * platforms. Value/onChange use the same "YYYY-MM-DD" string shape a native
 * date input would, so it's a drop-in swap wherever that pattern is used.
 */
export function DateField({ label, value, onChange, minDate, className }: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const selected = fromIso(value);
  const min = fromIso(minDate ?? toIso(new Date()));
  const [viewMonth, setViewMonth] = React.useState(() => selected ?? new Date());

  React.useEffect(() => {
    if (open) setViewMonth(selected ?? new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-xs font-medium text-muted-fg">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center gap-2 rounded-xl border border-input bg-surface px-3.5 text-left text-sm text-fg transition-colors active:bg-surface-2"
      >
        <CalendarDays className="size-4 shrink-0 text-muted-fg" />
        <span className={cn("truncate", !selected && "text-muted-fg")}>{formatLabel(value)}</span>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="pb-2">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month - 1, 1))}
              aria-label="Previous month"
              className="grid size-9 place-items-center rounded-full text-fg transition-transform active:scale-90"
            >
              <ChevronLeft className="size-5" />
            </button>
            <p className="font-display text-sm font-semibold">
              {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </p>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              aria-label="Next month"
              className="grid size-9 place-items-center rounded-full text-fg transition-transform active:scale-90"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-fg">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="py-1.5">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const disabled = min ? day < new Date(min.getFullYear(), min.getMonth(), min.getDate()) : false;
              const isSelected = selected ? isSameDay(day, selected) : false;
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(toIso(day));
                    void haptics.selectionChanged();
                    setOpen(false);
                  }}
                  className={cn(
                    "font-tabular relative aspect-square rounded-full text-sm font-medium transition-colors",
                    disabled && "text-muted-fg/40",
                    !disabled && !isSelected && "text-fg active:bg-surface-2",
                    isSelected && "bg-accent text-accent-fg",
                    isToday && !isSelected && "text-accent",
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
