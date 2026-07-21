import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronUp, ReceiptText, Star } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import { StarRating } from "@/features/hotels/StarRating";
import { STATUS_LABEL, type FoodOrder, type FoodReview } from "./types";

const POLL_MS = 15_000;

export function FoodOrdersPage() {
  // Light polling so status changes made by the kitchen show up without a
  // manual refresh — the same "live" feel as the partner order board.
  // Pauses automatically while the tab is in the background.
  const orders = useResource<FoodOrder[]>(
    () => api.get(endpoints.restaurants.myOrders),
    [],
    { refreshInterval: POLL_MS },
  );
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Light polling so status changes made by the kitchen show up without a
  // manual refresh — the same "live" feel as the partner order board.
  useEffect(() => {
    const t = setInterval(() => orders.refetch(), POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cancel(orderId: string) {
    setCancellingId(orderId);
    try {
      await api.post(endpoints.restaurants.cancel(orderId));
      toast.success("Order cancelled", "Wallet payments are refunded to your wallet instantly; other payments are returned to the original payment method.");
      orders.refetch();
    } catch (e) {
      toast.error((e instanceof ApiError && (e.detail as { message?: string })?.message) || "Couldn't cancel the order.");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My food orders"
        subtitle="Track live orders and review past ones."
        actions={
          <Link to="/app/restaurants" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <ArrowLeft className="size-4" /> Restaurants
          </Link>
        }
      />

      <AsyncBoundary state={orders.state} onRetry={orders.refetch} label="Orders"
        empty={<EmptyState icon={<ReceiptText className="size-6" />} title="No orders yet" description="Order from a restaurant and it will show up here." />}
      >
        <div className="space-y-3">
          {orders.data?.map((o) => {
            const expanded = expandedId === o.id;
            return (
              <Card key={o.id} className="overflow-hidden p-0">
                <button type="button" onClick={() => setExpandedId(expanded ? null : o.id)}
                  className="flex w-full flex-col gap-3 p-5 text-left sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-semibold">{o.restaurant.restaurantName}</h3>
                      <StatusBadge status={o.status} />
                      <span className="text-xs text-muted-fg">{o.orderRef}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-fg">
                      {o.items.reduce((s, i) => s + i.quantity, 0)} item(s) • {o.fulfillment === "delivery" ? "Delivery" : "Pickup"} • {new Date(o.placedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-display text-lg font-bold">रू {o.grandTotal.toLocaleString()}</p>
                    {o.status === "PENDING" && (
                      <Button variant="outline" size="sm" disabled={cancellingId === o.id}
                        onClick={(e) => { e.stopPropagation(); cancel(o.id); }}
                      >
                        {cancellingId === o.id ? "Cancelling…" : "Cancel"}
                      </Button>
                    )}
                    {expanded ? <ChevronUp className="size-4 text-muted-fg" /> : <ChevronDown className="size-4 text-muted-fg" />}
                  </div>
                </button>
                {expanded && (
                  <div className="space-y-4 border-t border-border p-5">
                    <div className="space-y-1.5 text-sm">
                      {o.items.map((i) => (
                        <div key={i.id} className="flex items-center justify-between">
                          <span className="text-muted-fg">{i.quantity} × {i.name}</span>
                          <span>रू {i.lineTotal.toLocaleString()}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between border-t border-border pt-2">
                        <span className="text-muted-fg">Delivery + service fee</span>
                        <span>रू {(o.deliveryFee + o.serviceFee).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between font-display font-bold">
                        <span>Total</span>
                        <span>रू {o.grandTotal.toLocaleString()}</span>
                      </div>
                    </div>
                    {o.deliveryAddress && <p className="text-xs text-muted-fg">Deliver to: {o.deliveryAddress}</p>}
                    {o.note && <p className="text-xs text-muted-fg">Note: {o.note}</p>}
                    {o.status === "DELIVERED" && <ReviewPanel orderId={o.id} />}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function StatusBadge({ status }: { status: FoodOrder["status"] }) {
  const variant = status === "DELIVERED" ? "success" : status === "CANCELLED" ? "danger" : "outline";
  return <Badge variant={variant}>{STATUS_LABEL[status].toLowerCase()}</Badge>;
}

/** Show the existing review, or the form to leave one — mirrors the hotel review flow. */
function ReviewPanel({ orderId }: { orderId: string }) {
  const review = useResource<FoodReview | null>(() => api.get(endpoints.restaurants.review(orderId)), [orderId]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.post(endpoints.restaurants.review(orderId), { rating, comment: comment || undefined });
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
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-fg">Rate this order</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} type="button" onClick={() => setRating(s)}>
            <Star className={cn("size-5", s <= rating ? "fill-amber-400 text-amber-400" : "text-muted-fg")} />
          </button>
        ))}
      </div>
      <Input className="mt-3" placeholder="How was the food? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button variant="accent" size="sm" className="mt-3" disabled={submitting} onClick={submit}>
        {submitting ? "Submitting…" : "Submit review"}
      </Button>
    </div>
  );
}