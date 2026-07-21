import { Star } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import { StarRating } from "./StarRating";
import type { PartnerReview, ReviewSummary } from "./types";

export function HotelReviewsPage() {
  const summary = useResource<ReviewSummary>(() => api.get(endpoints.hotels.partner.reviewSummary), []);
  const reviews = useResource<PartnerReview[]>(() => api.get(endpoints.hotels.partner.reviews), []);

  return (
    <div className="space-y-6">
      <PageHeader title="Reviews" subtitle="What guests are saying about your properties." />

      <SummaryCard summary={summary.state === "success" ? summary.data : null} loading={summary.state === "loading"} />

      <AsyncBoundary
        state={reviews.state}
        onRetry={reviews.refetch}
        label="Reviews"
        empty={
          <EmptyState
            icon={<Star className="size-6" />}
            title="No reviews yet"
            description="Once guests check in and rate their stay, their reviews will show up here."
          />
        }
      >
        <div className="space-y-3">
          {reviews.data?.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-base font-semibold">{r.guestName}</h3>
                  <StarRating value={r.rating} size={15} />
                </div>
                <span className="text-xs text-muted-fg">{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="mt-1 text-sm text-muted-fg">
                {r.hotelName} • {r.roomTypeName} • {r.checkIn} → {r.checkOut} • {r.bookingRef}
              </p>
              {r.comment && <p className="mt-2.5 text-sm leading-relaxed">{r.comment}</p>}
            </Card>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function SummaryCard({ summary, loading }: { summary: ReviewSummary | null; loading: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex shrink-0 flex-col items-center gap-1.5 sm:border-r sm:border-border sm:pr-6">
          <p className="font-display text-4xl font-bold tracking-tight">
            {loading || !summary ? "—" : summary.average.toFixed(1)}
          </p>
          <StarRating value={summary?.average ?? 0} size={16} />
          <p className="text-xs text-muted-fg">
            {loading || !summary ? "No data yet" : `${summary.count} review${summary.count === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex-1 space-y-1.5">
          {(summary?.distribution ?? [5, 4, 3, 2, 1].map((star) => ({ star, count: 0 }))).map((row) => {
            const total = summary?.count ?? 0;
            const pct = total > 0 ? (row.count / total) * 100 : 0;
            return (
              <div key={row.star} className="flex items-center gap-2 text-xs">
                <span className="w-3 text-muted-fg">{row.star}</span>
                <Star className="size-3 fill-amber-400 text-amber-400" />
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-6 text-right text-muted-fg">{row.count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}