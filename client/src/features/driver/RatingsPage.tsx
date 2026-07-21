import { Star } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card } from "@/components/ui/card";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  riderName: string;
  service: string;
  from: string;
  to: string;
}
interface Summary {
  average: number;
  count: number;
  distribution: { star: number; count: number }[];
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={`size-4 ${s <= value ? "fill-warning text-warning" : "text-border"}`} />
      ))}
    </div>
  );
}

export function RatingsPage() {
  const summary = useResource<Summary>(() => api.get(endpoints.driver.reviewSummary));
  const reviews = useResource<Review[]>(() => api.get(endpoints.driver.reviews));

  return (
    <div className="space-y-6">
      <PageHeader title="Ratings" subtitle="Rider feedback from your completed trips." />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Average rating"
          icon="Star"
          state={summary.state}
          value={summary.data && summary.data.count > 0 ? `${summary.data.average.toFixed(1)} ★` : "—"}
          caption={summary.data ? `from ${summary.data.count} review${summary.data.count === 1 ? "" : "s"}` : ""}
        />
        <Card className="p-5">
          <p className="mb-2 text-sm text-muted-fg">Breakdown</p>
          {(summary.data?.distribution ?? [5, 4, 3, 2, 1].map((star) => ({ star, count: 0 }))).map((d) => {
            const total = summary.data?.count ?? 0;
            const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
            return (
              <div key={d.star} className="flex items-center gap-2 py-0.5 text-xs">
                <span className="w-3 text-muted-fg">{d.star}</span>
                <Star className="size-3 fill-warning text-warning" />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-6 text-right text-muted-fg">{d.count}</span>
              </div>
            );
          })}
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">Recent reviews</h2>
        <AsyncBoundary
          state={reviews.state}
          onRetry={reviews.refetch}
          label="Your reviews"
          empty={
            <EmptyState
              icon={<Star className="size-6 text-muted-fg" />}
              title="No reviews yet"
              description="Riders can rate a trip once it's completed — reviews will show up here as they come in."
            />
          }
        >
          <div className="space-y-3">
            {(reviews.data ?? []).map((r) => (
              <Card key={r.id} className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <Stars value={r.rating} />
                  <span className="text-xs text-muted-fg">
                    {new Date(r.createdAt).toLocaleDateString("en-NP", { dateStyle: "medium" })}
                  </span>
                </div>
                <p className="text-sm font-medium capitalize">
                  {r.riderName} · {r.service} · {r.from} → {r.to}
                </p>
                {r.comment && <p className="text-sm text-muted-fg">{r.comment}</p>}
              </Card>
            ))}
          </div>
        </AsyncBoundary>
      </div>
    </div>
  );
}