import { useMemo } from "react";
import { AlertCircle, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncBoundary } from "@/components/shared/async-states";
import { Card } from "@/components/ui/card";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import type { PartnerBusRevenue } from "./types";

export function BusRevenuePage() {
  const revenue = useResource<PartnerBusRevenue>(() => api.get(endpoints.buses.op.revenue), []);

  const activeDays = useMemo(
    () => revenue.data?.daily.filter((d) => d.bookings > 0 || d.cancelled > 0) ?? [],
    [revenue.data],
  );
  const maxDaily = useMemo(
    () => Math.max(1, ...(revenue.data?.daily.map((d) => d.netProfit) ?? [1])),
    [revenue.data],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue" subtitle="Your earnings across every route, updated in real time." />

      <AsyncBoundary state={revenue.state} onRetry={revenue.refetch} label="Revenue">
        {revenue.data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Today" value={revenue.data.summary.todayRevenue} />
              <Stat label="This month" value={revenue.data.summary.monthRevenue} />
              <Stat label="All-time net profit" value={revenue.data.summary.netProfit} highlight />
              <Stat label="Avg. booking value" value={revenue.data.summary.avgBookingValue} />
              <Stat label="Total bookings" value={revenue.data.summary.totalBookings} plain />
              <Stat label="Cancelled" value={revenue.data.summary.totalCancelled} plain />
              <Stat label="Platform fee (riders paid)" value={revenue.data.summary.totalPlatformFee} />
              <Stat label="Refunded to riders" value={revenue.data.summary.totalRefunded} />
            </div>

            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="size-4 text-muted-fg" />
                <h3 className="font-display text-sm font-semibold">Last 30 days</h3>
              </div>

              {activeDays.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-fg">
                  <AlertCircle className="size-5" />
                  No bookings in the last 30 days yet.
                </div>
              ) : (
                <>
                  <div className="flex h-32 items-end gap-1">
                    {revenue.data.daily.map((d) => (
                      <div
                        key={d.date}
                        title={`${d.date}: रू ${d.netProfit.toLocaleString()}`}
                        className="flex-1 rounded-t bg-teal-700 dark:bg-accent"
                        style={{ height: `${Math.max(2, (d.netProfit / maxDaily) * 100)}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-4 max-h-64 space-y-1 overflow-y-auto pr-1">
                    {activeDays
                      .slice()
                      .reverse()
                      .map((d) => (
                        <div key={d.date} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                          <span className="text-muted-fg">{d.date}</span>
                          <span className="text-muted-fg">{d.bookings} booking{d.bookings === 1 ? "" : "s"} · {d.seats} seats</span>
                          <span className="font-tabular font-semibold">रू {d.netProfit.toLocaleString()}</span>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </Card>
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}

function Stat({ label, value, highlight, plain }: { label: string; value: number; highlight?: boolean; plain?: boolean }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">{label}</p>
      <p className={`mt-2 font-display font-tabular text-xl font-bold ${highlight ? "text-teal-700 dark:text-accent" : ""}`}>
        {plain ? value.toLocaleString() : `रू ${value.toLocaleString()}`}
      </p>
    </Card>
  );
}