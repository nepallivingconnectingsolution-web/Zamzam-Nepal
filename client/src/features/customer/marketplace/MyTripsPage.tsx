import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bike, Car, Package, Route, Star } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, npr } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import { StarRating } from "@/features/hotels/StarRating";

interface Ride {
  id: string;
  driverId: string | null;
  service: "taxi" | "bike" | "parcel";
  from: string;
  to: string;
  fare: number;
 status: "COMPLETED" | "CANCELLED" | "ONGOING" | "REQUESTED" | "ACCEPTED" | "PAYMENT_PENDING";
  paymentMethod: string | null;
  createdAt: string;
}

interface RideReview {
  id: string;
  rideId: string;
  driverId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

const SERVICE_ICON = { taxi: Car, bike: Bike, parcel: Package } as const;
const SERVICE_LABEL = { taxi: "Taxi", bike: "Bike", parcel: "Parcel" } as const;

const STATUS_VARIANT: Record<Ride["status"], "success" | "danger" | "outline" | "accent" | "warning"> = {
  COMPLETED: "success",
  CANCELLED: "danger",
  ONGOING: "accent",
  REQUESTED: "outline",
  ACCEPTED: "outline",
  PAYMENT_PENDING: "warning",
};

const STATUS_LABEL: Record<Ride["status"], string> = {
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  ONGOING: "ongoing",
  REQUESTED: "requested",
  ACCEPTED: "accepted",
  PAYMENT_PENDING: "payment due",
};

/**
 * Every taxi/bike/parcel trip a customer has taken — the "My trips" nav
 * item. Completed trips get a "Rate this trip" panel that posts to
 * POST /rides/:id/review; the driver who ran that trip sees the result on
 * their own Ratings page (GET /driver/reviews).
 */
export function MyTripsPage() {
  const navigate = useNavigate();
  // Polled (not one-shot) so a trip a driver completes while this page is
  // open — status flipping ONGOING → COMPLETED, or any → CANCELLED — shows
  // up without the person having to hit the browser's refresh button.
  const rides = useResource<Ride[]>(() => api.get(endpoints.rides.history), [], {
    refreshInterval: 6000,
  });

  // Toast once per trip the moment it flips to COMPLETED. Keyed by ride id
  // so it fires exactly once even though this list keeps polling — a plain
  // "did status change" flag would refire on every subsequent poll tick.
  const prevStatuses = useRef<Map<string, Ride["status"]> | null>(null);
  useEffect(() => {
    if (rides.state === "idle" || rides.state === "loading") return;
    const current = new Map((rides.data ?? []).map((r) => [r.id, r.status] as const));
    if (prevStatuses.current) {
      for (const [id, status] of current) {
        const prev = prevStatuses.current.get(id);
        if (prev && prev !== "COMPLETED" && status === "COMPLETED") {
          toast.success("Trip completed", "Rate your trip below — thanks for riding with Zamzam!");
        }
      }
    }
    prevStatuses.current = current;
  }, [rides.data, rides.state]);

  return (
    <div className="space-y-6">
      <PageHeader title="My trips" subtitle="Every taxi, bike and parcel trip you've taken." />

      <AsyncBoundary
        state={rides.state}
        onRetry={rides.refetch}
        label="Trips"
        empty={
          <EmptyState
            icon={<Route className="size-6" />}
            title="No trips yet"
            description="Book a taxi, bike or parcel from the marketplace and it will show up here."
          />
        }
      >
        <div className="space-y-3">
          {rides.data?.map((r) => {
            const ServiceIcon = SERVICE_ICON[r.service];
            return (
              <Card key={r.id} className="space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ServiceIcon className="size-4 text-muted-fg" />
                    <h3 className="font-display text-base font-semibold">{SERVICE_LABEL[r.service]}</h3>
                  <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </div>
                  <p className="font-display text-lg font-bold">{npr(r.fare)}</p>
                </div>
                <p className="text-sm text-muted-fg">
                  {r.from} → {r.to} • {new Date(r.createdAt).toLocaleString()}
                  {r.status === "COMPLETED" && r.paymentMethod && (
                    <> • {r.paymentMethod === "wallet" ? "Paid from wallet" : "Paid in cash"}</>
                  )}
                </p>
                {r.status === "PAYMENT_PENDING" && (
                  <div className="flex items-center justify-between rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
                    <span>This trip has an unpaid fare of {npr(r.fare)}.</span>
                    <Button size="sm" variant="accent" onClick={() => navigate(`/app/book/${r.service}`)}>
                      Settle payment
                    </Button>
                  </div>
                )}
                {r.status === "COMPLETED" && r.driverId && <ReviewPanel rideId={r.id} />}
              </Card>
            );
          })}
        </div>
      </AsyncBoundary>
    </div>
  );
}

/** Show the existing review, or the form to leave one — mirrors the food/hotel review flow. */
function ReviewPanel({ rideId }: { rideId: string }) {
  const review = useResource<RideReview | null>(() => api.get(endpoints.rides.review(rideId)), [rideId]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.post(endpoints.rides.review(rideId), { rating, comment: comment || undefined });
      toast.success("Review submitted", "Thanks for the feedback!");
      review.refetch();
    } catch (e) {
      toast.error((e instanceof ApiError && (e.detail as { message?: string })?.message) || "Couldn't submit the review.");
    } finally {
      setSubmitting(false);
    }
  }

  if (review.state === "loading" || review.state === "idle") return null;

  if (review.data) {
    return (
      <div className="rounded-xl border border-border bg-surface-2/60 p-4">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-fg">
          <Star className="size-3.5" /> Your review
        </p>
        <StarRating value={review.data.rating} size={15} />
        {review.data.comment && <p className="mt-1.5 text-sm">{review.data.comment}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-fg">Rate this trip</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} type="button" onClick={() => setRating(s)}>
            <Star className={cn("size-5", s <= rating ? "fill-amber-400 text-amber-400" : "text-muted-fg")} />
          </button>
        ))}
      </div>
      <Input className="mt-3" placeholder="How was the trip? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button variant="accent" size="sm" className="mt-3" disabled={submitting} onClick={submit}>
        {submitting ? "Submitting…" : "Submit review"}
      </Button>
    </div>
  );
}