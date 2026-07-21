import type { ReactNode } from "react";
import { AlertTriangle, DatabaseZap, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AsyncState } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Empty state — an invitation to act, never a dead end.                      */
/* -------------------------------------------------------------------------- */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-surface-2 text-muted-fg">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-fg">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Waiting-for-data — shown when a resource resolves empty.                   */
/* -------------------------------------------------------------------------- */
export function WaitingForData({ label }: { label: string }) {
  return (
    <EmptyState
      icon={<DatabaseZap className="size-6 text-accent" />}
      title="Nothing here yet"
      description={`${label} will appear here as activity comes in.`}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Error — explains what happened and how to recover.                        */
/* -------------------------------------------------------------------------- */
export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <EmptyState
      icon={<AlertTriangle className="size-6 text-danger" />}
      title="Couldn't load this"
      description={message ?? "The request didn't go through. Check your connection and try again."}
      action={
        onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="size-4" /> Try again
          </Button>
        )
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  AsyncBoundary — the single switch every data surface routes through.       */
/* -------------------------------------------------------------------------- */
export function AsyncBoundary({
  state,
  onRetry,
  label,
  skeleton,
  empty,
  children,
}: {
  state: AsyncState;
  onRetry?: () => void;
  label: string;
  skeleton?: ReactNode;
  empty?: ReactNode;
  children: ReactNode;
}) {
  if (state === "loading" || state === "idle") {
    return <>{skeleton ?? <DefaultSkeleton />}</>;
  }
  if (state === "error") return <ErrorState onRetry={onRetry} />;
  if (state === "empty") return <>{empty ?? <WaitingForData label={label} />}</>;
  return <>{children}</>;
}

function DefaultSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
