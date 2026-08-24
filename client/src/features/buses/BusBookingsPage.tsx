import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bus, Clock, MapPin, Printer, Star, Ticket } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import { StarRating } from "@/features/hotels/StarRating";
import { BusTicketModal } from "./BusTicketDocument";
import type { BusTicket } from "./types";

interface TicketReview {
  id: string;
  ticketId: string;
  operatorId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

const statusVariant: Record<BusTicket["status"], "success" | "warning" | "danger" | "accent"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  COMPLETED: "accent",
  CANCELLED: "danger",
};

export function BusBookingsPage() {
  const tickets = useResource<BusTicket[]>(() => api.get(endpoints.buses.myBookings), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openTicket, setOpenTicket] = useState<BusTicket | null>(null);
  const [ticketSheetOpen, setTicketSheetOpen] = useState(false);

  async function cancel(id: string) {
    setBusyId(id);
    try {
      await api.post(endpoints.buses.cancel(id));
      toast.success("Booking cancelled", "Wallet payments are refunded to your wallet instantly; other payments go back via the original method.");
      tickets.refetch();
    } catch {
      toast.error("Couldn't cancel", "Please try again in a moment.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My bus tickets"
        subtitle="Every seat you've booked."
        actions={
          <Link to="/app/buses" className={cn(buttonVariants({ variant: "accent", size: "sm" }))}>
            <Ticket className="size-4" /> Book a bus
          </Link>
        }
      />

      <AsyncBoundary
        state={tickets.state}
        onRetry={tickets.refetch}
        label="Bus tickets"
        empty={
          <EmptyState
            icon={<Bus className="size-6" />}
            title="No bus tickets yet"
            description="When you book a bus seat it will show up here."
            action={
              <Link to="/app/buses" className={cn(buttonVariants({ variant: "accent", size: "sm" }))}>
                Find a bus <ArrowRight className="size-4" />
              </Link>
            }
          />
        }
      >
        <div className="space-y-3">
          {tickets.data?.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-700 dark:bg-white/10 dark:text-accent">
                    <Bus className="size-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-semibold">{t.bus?.operator}</h3>
                      <Badge variant={statusVariant[t.status]}>{t.status.toLowerCase()}</Badge>
                      {t.bookingRef && <span className="text-xs text-muted-fg">{t.bookingRef}</span>}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-fg">
                      <MapPin className="size-3.5" /> {t.bus?.from} <ArrowRight className="size-3.5" /> {t.bus?.to}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm">
                      <Clock className="size-3.5 text-accent" /> {t.bus?.date} • {t.bus?.departure}
                    </p>
                    <p className="mt-1 text-sm text-muted-fg">
                      Seats: <span className="font-medium text-fg">{t.seats.join(", ")}</span> • {t.passengers.length} passenger(s)
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <p className="font-display text-lg font-bold font-tabular">रू {t.grandTotal.toLocaleString()}</p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setOpenTicket(t); setTicketSheetOpen(true); }}>
                      <Printer className="size-4" /> E-ticket
                    </Button>
                    {t.status === "CONFIRMED" && (
                      <Button variant="outline" size="sm" disabled={busyId === t.id} onClick={() => cancel(t.id)}>
                        {busyId === t.id ? "Cancelling…" : "Cancel"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {t.status === "COMPLETED" && (
                <div className="mt-4 border-t border-border pt-4">
                  <TicketReviewPanel ticketId={t.id} />
                </div>
              )}
            </Card>
          ))}
        </div>
      </AsyncBoundary>

      <BusTicketModal ticket={openTicket} open={ticketSheetOpen} onClose={() => setTicketSheetOpen(false)} />
    </div>
  );
}

function TicketReviewPanel({ ticketId }: { ticketId: string }) {
  const review = useResource<TicketReview | null>(() => api.get(endpoints.buses.review(ticketId)), [ticketId]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.post(endpoints.buses.review(ticketId), { rating, comment: comment || undefined });
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
            <Star className={cn("size-5", s <= rating ? "fill-warning text-warning" : "text-muted-fg")} />
          </button>
        ))}
      </div>
      <Input className="mt-3" placeholder="How was the journey? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button variant="accent" size="sm" className="mt-3" disabled={submitting} onClick={submit}>
        {submitting ? "Submitting…" : "Submit review"}
      </Button>
    </div>
  );
}