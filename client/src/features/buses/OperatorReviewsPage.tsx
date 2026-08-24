import { Star } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import { cn } from "@/lib/utils";
import type { BusReviewSummary, PartnerBusReview } from "./types";

export function OperatorReviewsPage() {
  const summary = useResource<BusReviewSummary>(() => api.get(endpoints.buses.op.reviewSummary), []);
  const reviews = useResource<PartnerBusReview[]>(() => api.get(endpoints.buses.op.reviews), []);

  return (
    <div className="space-y-6">
      <PageHeader title="Reviews" subtitle="What passengers are saying about your buses." />

      <AsyncBoundary state={summary.state} onRetry={summary.refetch} label="Rating summary">
        {summary.data && (
          <Card className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center">
            <div className="text-center">
              <p className="font-display font-tabular text-4xl font-bold">{summary.data.average || "—"}</p>
              <StarRow rating={Math.round(summary.data.average)} size="size-4" />
              <p className="mt-1 text-xs text-muted-fg">{summary.data.count} review{summary.data.count === 1 ? "" : "s"}</p>
            </div>
            <div className="flex-1 space-y-1.5">
              {summary.data.distribution.map((d) => (
                <div key={d.star} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-muted-fg">{d.star}</span>
                  <Star className="size-3 fill-current text-amber-500" />
                  <div className="h-2 flex-1 rounded-full bg-surface-2">
                    <div
                      className="h-2 rounded-full bg-teal-700 dark:bg-accent"
                      style={{ width: summary.data!.count ? `${(d.count / summary.data!.count) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="w-6 text-right text-muted-fg font-tabular">{d.count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </AsyncBoundary>

      <AsyncBoundary
        state={reviews.state}
        onRetry={reviews.refetch}
        label="Reviews"
        empty={<EmptyState icon={<Star className="size-6" />} title="No reviews yet" description="Reviews appear here once a passenger completes and rates a trip." />}
      >
        <div className="space-y-3">
          {reviews.data?.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-semibold">{r.customerName}</p>
                <StarRow rating={r.rating} size="size-3.5" />
              </div>
              <p className="mt-1 text-xs text-muted-fg">{r.from} → {r.to} • {r.tripDate} • {r.bookingRef}</p>
              {r.comment && <p className="mt-2 text-sm text-fg">{r.comment}</p>}
            </Card>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function StarRow({ rating, size }: { rating: number; size: string }) {
  return (
    <div className="mt-1 flex justify-center gap-0.5 sm:justify-start">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={cn(size, i < rating ? "fill-amber-500 text-amber-500" : "text-muted-fg/30")} />
      ))}
    </div>
  );
}