import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BedDouble, CalendarRange, MapPin, Star } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import type { HotelBooking, HotelReview } from "./types";
import { StarRating } from "./StarRating";

const statusVariant: Record<HotelBooking["status"], "success" | "danger"> = {
  CONFIRMED: "success",
  CANCELLED: "danger",
};

export function HotelBookingsPage() {
  const bookings = useResource<HotelBooking[]>(() => api.get(endpoints.hotels.myBookings), []);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function cancel(id: string) {
    setBusyId(id);
    try {
      await api.post(endpoints.hotels.cancel(id));
      toast.success("Booking cancelled", "Wallet payments are refunded to your wallet instantly; other payments are returned to the original payment method.");
      bookings.refetch();
    } catch {
      toast.error("Couldn't cancel", "Please try again in a moment.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My hotel bookings"
        subtitle="Every room you've booked."
        actions={
          <Link to="/app/hotels" className={cn(buttonVariants({ variant: "accent", size: "sm" }))}>
            <BedDouble className="size-4" /> Book a hotel
          </Link>
        }
      />
      <AsyncBoundary
        state={bookings.state}
        onRetry={bookings.refetch}
        label="Hotel bookings"
        empty={
          <EmptyState
            icon={<BedDouble className="size-6" />}
            title="No hotel bookings yet"
            description="When you book a room it will show up here."
            action={
              <Link to="/app/hotels" className={cn(buttonVariants({ variant: "accent", size: "sm" }))}>
                Find a hotel <ArrowRight className="size-4" />
              </Link>
            }
          />
        }
      >
        <div className="space-y-3">
          {bookings.data?.map((b) => (
            <Card key={b.id} className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-700 dark:bg-white/10 dark:text-accent">
                    <BedDouble className="size-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-semibold">{b.hotel.hotelName}</h3>
                      <Badge variant={statusVariant[b.status]}>{b.status.toLowerCase()}</Badge>
                      <span className="text-xs text-muted-fg">{b.bookingRef}</span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-fg">
                      <MapPin className="size-3.5" /> {b.hotel.city}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm">
                      <CalendarRange className="size-3.5 text-accent" /> {b.checkIn} → {b.checkOut} ({b.nights} night{b.nights === 1 ? "" : "s"})
                    </p>
                    <p className="mt-1 text-sm text-muted-fg">
                      {b.hotel.roomTypeName} • {b.guests} guest(s) • {b.guestName}
                    </p>
                    {b.status === "CONFIRMED" && b.checkIn <= todayIso() && <BookingReview bookingId={b.id} />}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <p className="font-display text-lg font-bold font-tabular">रू {b.grandTotal.toLocaleString()}</p>
                  {b.status === "CONFIRMED" && (
                    <Button variant="outline" size="sm" disabled={busyId === b.id} onClick={() => cancel(b.id)}>
                      {busyId === b.id ? "Cancelling…" : "Cancel"}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

/** "YYYY-MM-DD" for today, matching the server's date-only checkIn/checkOut format. */
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Shown under a confirmed, already-checked-in booking. Lazily fetches
 * whether this booking already has a review; renders the guest's existing
 * review read-only, or a "Rate your stay" form if they haven't reviewed yet.
 */
function BookingReview({ bookingId }: { bookingId: string }) {
  const review = useResource<HotelReview | null>(() => api.get(endpoints.hotels.review(bookingId)), [bookingId]);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.post(endpoints.hotels.review(bookingId), { rating, comment: comment.trim() || undefined });
      toast.success("Thanks for the feedback!", "Your review helps other travellers pick this hotel.");
      setOpen(false);
      review.refetch();
    } catch (e) {
      toast.error((e instanceof ApiError && (e.detail as { message?: string })?.message) || "Couldn't submit your review.");
    } finally {
      setSubmitting(false);
    }
  }

  if (review.state === "loading" || review.state === "idle") return null;

  // A review already exists for this booking — show it read-only.
  if (review.state === "success" && review.data) {
    return (
      <div className="mt-3 rounded-xl border border-border bg-surface-2/60 p-3">
        <div className="flex items-center gap-2">
          <StarRating value={review.data.rating} size={14} />
          <span className="text-xs text-muted-fg">Your review</span>
        </div>
        {review.data.comment && <p className="mt-1.5 text-sm">{review.data.comment}</p>}
      </div>
    );
  }

  // No review yet — offer the form.
  return (
    <div className="mt-3">
      {!open ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Star className="size-4" /> Rate your stay
        </Button>
      ) : (
        <div className="rounded-xl border border-border p-3.5">
          <p className="mb-2 text-sm font-medium">How was your stay?</p>
          <StarRating value={rating} onChange={setRating} />
          <textarea
            className="mt-2.5 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            rows={2}
            placeholder="Share a few words about your stay (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="mt-2.5 flex gap-2">
            <Button variant="accent" size="sm" disabled={submitting} onClick={submit}>
              {submitting ? "Submitting…" : "Submit review"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}