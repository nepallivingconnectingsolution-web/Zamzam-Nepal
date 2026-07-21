import { Star } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import { StarRating } from "@/features/hotels/StarRating";
import type { BusReviewSummary, PartnerBusReview } from "./types";

export function BusReviewsPage() {
  const summary = useResource<BusReviewSummary>(() => api.get(endpoints.buses.op.reviewSummary), []);
  const reviews = useResource<PartnerBusReview[]>(() => api.get(endpoints.buses.op.reviews), []);
  const s = summary.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Reviews" subtitle="What passengers are saying about journeys on your routes." />

      <Card>
        <CardContent className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center">
          <AsyncBoundary state={summary.state} onRetry={summary.refetch} label="Rating">
            <div className="flex shrink-0 flex-col items-center gap-1 sm:w-40">
              <span className="text-4xl font-bold tracking-tight">{s?.count ? s.average.toFixed(1) : "—"}</span>
              <StarRating value={s?.average ?? 0} />
              <span className="text-xs text-muted-fg">{s?.count ?? 0} review{s?.count === 1 ? "" : "s"}</span>
            </div>
          </AsyncBoundary>

          <div className="flex-1 space-y-1.5">
            {(s?.distribution ?? [5, 4, 3, 2, 1].map((star) => ({ star, count: 0 }))).map((d) => {
              const pct = s?.count ? Math.round((d.count / s.count) * 100) : 0;
              return (
                <div key={d.star} className="flex items-center gap-2 text-sm">
                  <span className="w-3 text-muted-fg">{d.star}</span>
                  <Star className="size-3.5 fill-amber-400 text-amber-400" />
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-xs text-muted-fg">{d.count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <AsyncBoundary
        state={reviews.state}
        onRetry={reviews.refetch}
        label="Reviews"
        empty={
          <EmptyState
            icon={<Star className="size-6 text-muted-fg" />}
            title="No reviews yet"
            description="Reviews appear here once passengers rate a completed journey."
          />
        }
      >
        <div className="space-y-3">
          {(reviews.data ?? []).map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.customerName}</span>
                    <StarRating value={r.rating} size={14} />
                  </div>
                  <span className="text-xs text-muted-fg">{new Date(r.createdAt).toLocaleDateString("en-NP", { year: "numeric", month: "short", day: "numeric" })}</span>
                </div>
                <div className="text-xs text-muted-fg">
                  {r.route} · {r.date} · {r.bookingRef}
                </div>
                {r.comment && <p className="text-sm leading-relaxed">{r.comment}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}