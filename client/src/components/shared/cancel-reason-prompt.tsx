import { Button } from "@/components/ui/button";

/**
 * Quick-select "why are you cancelling" chips, Uber-style — tapping a chip
 * fires the cancellation immediately (no separate submit step), since
 * choosing to cancel is already the deliberate action; the chips exist to
 * capture *why*, not to add another confirmation click. Shared between the
 * customer's ServiceBookingPage and the driver's CurrentTripPage, each with
 * their own reason list.
 */
export function CancelReasonPrompt({
  reasons,
  busy,
  onPick,
  onDismiss,
}: {
  reasons: string[];
  busy: boolean;
  onPick: (reason: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
      <p className="text-xs font-medium text-muted-fg">Why are you cancelling?</p>
      <div className="flex flex-wrap gap-2">
        {reasons.map((r) => (
          <Button key={r} variant="outline" size="sm" disabled={busy} onClick={() => onPick(r)}>
            {r}
          </Button>
        ))}
      </div>
      <button
        type="button"
        className="text-xs text-muted-fg underline disabled:opacity-50"
        onClick={onDismiss}
        disabled={busy}
      >
        Never mind
      </button>
    </div>
  );
}