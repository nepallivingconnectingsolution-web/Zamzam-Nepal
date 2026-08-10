import * as React from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/utils";

export interface SelectFieldOption {
  value: string;
  label: string;
  hint?: string;
}

export interface SelectFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectFieldOption[];
  placeholder?: string;
  className?: string;
}

/**
 * Bottom-sheet single-select — the mobile-native replacement for a raw
 * `<select>`, for lists too long or too label-heavy for a Chip row or
 * SegmentedControl (vehicle types, fuel types, product categories, etc.).
 */
export function SelectField({ label, value, onChange, options, placeholder, className }: SelectFieldProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <label className="text-xs font-medium text-muted-fg">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-surface px-3.5 text-left text-sm text-fg transition-colors active:bg-surface-2"
      >
        <span className={cn("truncate", !selected && "text-muted-fg")}>{selected?.label ?? placeholder ?? "Select…"}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-fg" />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={label ?? "Select"}>
        <div className="space-y-1 pb-2">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition-colors active:bg-surface-2"
            >
              <span>
                <span className="font-medium">{o.label}</span>
                {o.hint && <span className="ml-1.5 text-xs text-muted-fg">{o.hint}</span>}
              </span>
              {o.value === value && <CheckCircle2 className="size-4 shrink-0 text-accent" />}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
