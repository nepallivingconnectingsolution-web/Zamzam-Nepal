import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Suspense fallback for lazy-loaded route chunks (see routes/index.tsx).
 * Intentionally just a spinner, not a content skeleton — this covers the
 * brief moment a route's JS chunk is downloading, not a data fetch, so it
 * shouldn't imply a specific page shape the way AsyncBoundary's skeletons
 * do for in-page data loading.
 *
 * `fullScreen` covers shell-less top-level routes (auth, landing); the
 * default fills the content area inside an already-mounted portal shell so
 * only the outlet swaps, not the header/nav around it.
 */
export function RouteFallback({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        fullScreen ? "min-h-screen bg-bg" : "min-h-[50vh]",
      )}
      role="status"
      aria-label="Loading"
    >
      <Loader2 className="size-6 animate-spin text-accent" />
    </div>
  );
}
