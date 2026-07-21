import { Link } from "react-router-dom";
import { ArrowRight, Bus, CalendarClock, Milestone, Ticket } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import type { OperatorRoute } from "./types";

/**
 * A "route" isn't a separate entity you create — it's the distinct
 * fromCity → toCity pairs across the schedules you've published (see
 * BusesService.operatorRoutes on the server). Publish a schedule under a
 * bus on the Schedules tab and it shows up here automatically, with live
 * ticket sales and revenue rolled up per route.
 */
export function OperatorRoutesPage() {
  const routes = useResource<OperatorRoute[]>(() => api.get(endpoints.buses.op.routes), []);

  return (
    <div className="space-y-6">
      <PageHeader title="Routes" subtitle="Every fromCity → toCity your schedules cover, with live sales." />

      <AsyncBoundary
        state={routes.state}
        onRetry={routes.refetch}
        label="Routes"
        empty={
          <EmptyState
            icon={<Milestone className="size-6 text-muted-fg" />}
            title="No routes yet"
            description="Add a bus, then publish a schedule for it — the route it serves will appear here automatically."
            action={
              <Link to="/operator/schedules" className={cn(buttonVariants({ variant: "accent" }))}>
                Publish a schedule
              </Link>
            }
          />
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {routes.data?.map((r) => (
            <Card key={`${r.fromCity}-${r.toCity}`} className="p-5">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-semibold">{r.fromCity}</h3>
                <ArrowRight className="size-4 text-muted-fg" />
                <h3 className="font-display text-base font-semibold">{r.toCity}</h3>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant={r.activeSchedules > 0 ? "success" : "outline"}>
                  {r.activeSchedules} active schedule{r.activeSchedules === 1 ? "" : "s"}
                </Badge>
                {r.buses.map((name) => (
                  <span key={name} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-fg">
                    <Bus className="size-3" /> {name}
                  </span>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                <div>
                  <p className="flex items-center justify-center gap-1 text-xs text-muted-fg"><CalendarClock className="size-3.5" /> Upcoming</p>
                  <p className="mt-0.5 font-display text-sm font-semibold">{r.upcomingDepartures}</p>
                </div>
                <div>
                  <p className="flex items-center justify-center gap-1 text-xs text-muted-fg"><Ticket className="size-3.5" /> Sold</p>
                  <p className="mt-0.5 font-display text-sm font-semibold">{r.ticketsSold}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-fg">Price</p>
                  <p className="mt-0.5 font-display text-sm font-semibold">
                    {r.priceMin === r.priceMax ? `रू ${r.priceMin.toLocaleString()}` : `रू ${r.priceMin.toLocaleString()}–${r.priceMax.toLocaleString()}`}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-right text-sm font-medium text-muted-fg">
                रू {r.revenue.toLocaleString()} <span className="font-normal">earned on this route</span>
              </p>
            </Card>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}