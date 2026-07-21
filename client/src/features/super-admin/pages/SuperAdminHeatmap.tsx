import { ExternalLink, Flame, MapPin, Route } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { RevenueAreaChart } from "@/components/shared/revenue-area-chart";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";

interface HeatmapData {
  totalRides7d: number;
  cells: { lat: number; lng: number; count: number }[];
  byHour: { hour: number; count: number }[];
  byService: { service: string; count: number }[];
}

/** Pads an hour number to "08:00" style labels. */
function hourLabel(hour: number): string {
  return String(hour).padStart(2, "0") + ":00";
}

/**
 * Demand analytics from the pickup coordinates every booking already
 * records: bookings per hour of day, the busiest pickup zones on a
 * ~1.1 km grid (each linking straight to Google Maps), and the split
 * across services - all over the last 7 days.
 */
export function SuperAdminHeatmap() {
  const { saApi } = useSuperAdminApi();
  const heatmap = useResource<HeatmapData>(() => saApi("/super-admin/heatmap"));
  const d = heatmap.data;

  const busiestHour = d?.byHour.reduce((max, h) => (h.count > max.count ? h : max), { hour: 0, count: 0 });
  const maxCell = d?.cells[0]?.count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Demand Heatmap" subtitle="Where and when rides are requested - last 7 days." />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-fg">
            <Route className="size-4" /> Rides (7 days)
          </div>
          <p className="mt-3 font-display text-2xl font-bold">{d ? d.totalRides7d : "-"}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-fg">
            <Flame className="size-4" /> Busiest hour
          </div>
          <p className="mt-3 font-display text-2xl font-bold">
            {d && busiestHour && busiestHour.count > 0 ? hourLabel(busiestHour.hour) : "-"}
          </p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-fg">
            <MapPin className="size-4" /> Active zones
          </div>
          <p className="mt-3 font-display text-2xl font-bold">{d ? d.cells.length : "-"}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Demand by hour of day</CardTitle>
          <CardDescription>Bookings per hour over the last 7 days - plan driver incentives around the peaks.</CardDescription>
        </CardHeader>
        <div className="px-2 pb-4">
          <AsyncBoundary
            state={heatmap.state}
            onRetry={heatmap.refetch}
            label="Demand data"
            empty={
              <div className="px-5 py-10">
                <EmptyState
                  icon={<Flame className="size-6 text-muted-fg" />}
                  title="No demand data yet"
                  description="Ride bookings from the last 7 days will populate this chart."
                />
              </div>
            }
          >
            <RevenueAreaChart
              categories={(d?.byHour ?? []).map((h) => hourLabel(h.hour))}
              series={[{ name: "Bookings", color: "#22c55e", data: (d?.byHour ?? []).map((h) => h.count) }]}
              valueFormatter={(v) => Math.round(v) + " bookings"}
            />
          </AsyncBoundary>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Hottest pickup zones</CardTitle>
            <CardDescription>Roughly 1.1 km grid cells ranked by pickups. Open in Maps to see the exact area.</CardDescription>
          </CardHeader>
          <AsyncBoundary state={heatmap.state} onRetry={heatmap.refetch} label="Zones">
            {(d?.cells ?? []).length === 0 ? (
              <div className="px-5 py-8">
                <EmptyState
                  icon={<MapPin className="size-6 text-muted-fg" />}
                  title="No zones yet"
                  description="Zones appear once bookings with map coordinates come in."
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {(d?.cells ?? []).slice(0, 10).map((c, i) => {
                  const barWidth = maxCell ? Math.max((c.count / maxCell) * 100, 4) : 0;
                  const mapsUrl = "https://www.google.com/maps?q=" + c.lat + "," + c.lng;
                  const zoneLabel =
                    c.lat.toFixed(2) + ", " + c.lng.toFixed(2) + " - " + c.count + (c.count === 1 ? " pickup" : " pickups");
                  return (
                    <li key={c.lat + "," + c.lng} className="flex items-center gap-3 px-5 py-3">
                      <span className="w-6 shrink-0 text-sm font-semibold text-muted-fg">#{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-accent" style={{ width: barWidth + "%" }} />
                        </div>
                        <p className="mt-1 text-xs text-muted-fg">{zoneLabel}</p>
                      </div>
                      <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline">
                        Maps <ExternalLink className="size-3" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </AsyncBoundary>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By service</CardTitle>
            <CardDescription>Last 7 days.</CardDescription>
          </CardHeader>
          <AsyncBoundary state={heatmap.state} onRetry={heatmap.refetch} label="Service split">
            {(d?.byService ?? []).length === 0 ? (
              <div className="px-5 py-8">
                <EmptyState
                  icon={<Route className="size-6 text-muted-fg" />}
                  title="No rides yet"
                  description="The taxi / bike / parcel split shows here."
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {(d?.byService ?? []).map((s) => (
                  <li key={s.service} className="flex items-center justify-between px-5 py-3">
                    <Badge variant="outline" className="text-[10px]">{s.service}</Badge>
                    <span className="text-sm font-semibold">{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </AsyncBoundary>
        </Card>
      </div>
    </div>
  );
}
