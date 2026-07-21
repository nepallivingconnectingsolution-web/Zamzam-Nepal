import { useState } from "react";
import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";

/**
 * Appears once a trip flips from ONGOING to completed (see ServiceBookingPage's
 * activeRide effect). Submits to POST /rides/:id/review — the same endpoint
 * the driver-side Ratings page reads from via GET /rides/driver/reviews.
 */
export function RateTripPrompt({ rideId, onDone }: { rideId: string; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (rating === 0) {
      toast.error("Pick a star rating first.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(endpoints.rides.review(rideId), { rating, comment: comment.trim() || undefined });
      toast.success("Thanks for rating your trip!");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't submit your rating. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="space-y-4 border-accent/40 bg-accent/5 p-5">
      <div>
        <p className="text-sm font-semibold">How was your trip?</p>
        <p className="text-xs text-muted-fg">Your driver sees this rating and any comment you leave.</p>
      </div>

      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className="p-0.5"
            aria-label={`${star} star`}
          >
            <Star
              className={`size-7 ${
                star <= (hovered || rating) ? "fill-warning text-warning" : "text-muted-fg"
              }`}
            />
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Anything you'd like to add? (optional)"
        rows={2}
        className="flex w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-muted-fg transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={submitting}>
          Skip
        </Button>
        <Button variant="accent" size="sm" onClick={submit} disabled={submitting}>
          Submit rating
        </Button>
      </div>
    </Card>
  );
}