import { MapPinned, Route as RouteIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import type { OperatorRoute } from "./types";

export function OperatorRoutesPage() {
  const routes = useResource<OperatorRoute[]>(() => api.get(endpoints.buses.op.routes), []);

  return (
    <div className="space-y-6">
      <PageHeader title="Routes" subtitle="Every from → to pair across your published schedules, aggregated live." />

      <AsyncBoundary
        state={routes.state}
        onRetry={routes.refetch}
        label="Routes"
        empty={
          <EmptyState
            icon={<RouteIcon className="size-6" />}
            title="No routes yet"
            description="Publish a schedule under the Buses tab and it'll show up here as a route."
          />
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {routes.data?.map((r) => (
            <Card key={`${r.fromCity}::${r.toCity}`} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <MapPinned className="size-4 text-muted-fg" />
                  <h3 className="font-display text-sm font-semibold">{r.fromCity} → {r.toCity}</h3>
                </div>
                <Badge variant={r.activeSchedules > 0 ? "success" : "default"}>
                  {r.activeSchedules} active schedule{r.activeSchedules === 1 ? "" : "s"}
                </Badge>
              </div>

              <p className="mt-2 text-xs text-muted-fg">
                Buses: {r.buses.length > 0 ? r.buses.join(", ") : "—"}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Metric label="Price range" value={r.priceMin === r.priceMax ? `रू ${r.priceMin.toLocaleString()}` : `रू ${r.priceMin.toLocaleString()}–${r.priceMax.toLocaleString()}`} />
                <Metric label="Upcoming" value={String(r.upcomingDepartures)} />
                <Metric label="Tickets sold" value={String(r.ticketsSold)} />
                <Metric label="Revenue" value={`रू ${r.revenue.toLocaleString()}`} />
              </div>
            </Card>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2.5 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-fg">{label}</p>
      <p className="font-tabular font-semibold">{value}</p>
    </div>
  );
}