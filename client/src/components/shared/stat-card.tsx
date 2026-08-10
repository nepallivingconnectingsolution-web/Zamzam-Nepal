import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/ui/icon";
import type { AsyncState } from "@/types";

/**
 * A KPI tile. When no value is available it renders a deliberate "—" with a
 * "no data" caption rather than a fabricated number.
 */
export function StatCard({
  label,
  value,
  icon,
  state,
  caption,
}: {
  label: string;
  value?: string | number;
  icon: string;
  state: AsyncState;
  caption?: string;
}) {
  return (
   <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-muted-fg">{label}</span>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-fg">
          <Icon name={icon} className="size-[18px]" />
        </span>
      </div>
      <div className="mt-4 min-w-0">
        {state === "loading" ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p
            className={cn(
              "truncate font-display text-2xl font-bold font-tabular tracking-tight",
              state !== "success" && "text-muted-fg",
            )}
          >
            {state === "success" ? value : "—"}
          </p>
        )}
        <p className="mt-1 truncate text-xs text-muted-fg">
          {state === "success" ? caption : "No data available"}
        </p>
      </div>
    </Card>
  );
}
