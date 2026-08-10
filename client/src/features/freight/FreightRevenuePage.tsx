import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { RevenueAreaChart } from "@/components/shared/revenue-area-chart";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import { npr } from "@/lib/utils";

interface FreightRevenueSummary {
  todayRevenue: number;
  monthRevenue: number;
  totalRevenue: number;
  totalPlatformFee: number;
  totalRefunded: number;
  netProfit: number;
  totalBookings: number;
  totalCancelled: number;
  avgBookingValue: number;
}

interface FreightRevenueDailyBucket {
  date: string;
  shipments: number;
  grossRevenue: number;
  cancelled: number;
}

interface PartnerFreightRevenue {
  summary: FreightRevenueSummary;
  daily: FreightRevenueDailyBucket[];
}

export function FreightRevenuePage() {
  const revenue = useResource<PartnerFreightRevenue>(() => api.get(endpoints.freight.revenue), []);
  const s = revenue.data?.summary;

  const categories = (revenue.data?.daily ?? []).map((d) =>
    new Date(d.date).toLocaleDateString("en-NP", { month: "short", day: "numeric" }),
  );
  const revenueSeries = (revenue.data?.daily ?? []).map((d) => d.grossRevenue);
  const dailyRows = [...(revenue.data?.daily ?? [])].reverse().filter((d) => d.shipments > 0 || d.cancelled > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue" subtitle="Earnings from delivered shipments across your accepted bids." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Revenue (today)" icon="Banknote" state={revenue.state} value={s ? npr(s.todayRevenue, { compact: true }) : undefined} caption="From today's deliveries" />
        <StatCard label="Revenue (this month)" icon="TrendingUp" state={revenue.state} value={s ? npr(s.monthRevenue, { compact: true }) : undefined} caption="So far this month" />
        <StatCard label="Total revenue" icon="Wallet" state={revenue.state} value={s ? npr(s.totalRevenue, { compact: true }) : undefined} caption="All-time, delivered shipments" />
        <StatCard label="Platform fee" icon="ArrowLeftRight" state={revenue.state} value={s ? npr(s.totalPlatformFee, { compact: true }) : undefined} caption="Zamzam doesn't charge freight commission yet" />
        <StatCard label="Cancelled after acceptance" icon="AlertTriangle" state={revenue.state} value={s ? String(s.totalCancelled) : undefined} caption="Loads cancelled after you were assigned" />
        <StatCard label="Avg. shipment value" icon="Star" state={revenue.state} value={s ? npr(s.avgBookingValue, { compact: true }) : undefined} caption={s ? `${s.totalBookings} delivered shipment(s)` : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily revenue</CardTitle>
          <CardDescription>Last 30 days — earnings from shipments delivered each day.</CardDescription>
        </CardHeader>
        <div className="px-5 pb-5">
          <AsyncBoundary
            state={revenue.state}
            onRetry={revenue.refetch}
            label="Revenue"
            empty={
              <EmptyState
                icon={<TrendingUp className="size-6 text-muted-fg" />}
                title="No revenue yet"
                description="This chart fills in as you deliver shipments you've won bids on."
              />
            }
          >
            <RevenueAreaChart
              categories={categories}
              series={[{ name: "Revenue", color: "#10B981", data: revenueSeries }]}
              height={280}
            />
          </AsyncBoundary>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily breakdown</CardTitle>
          <CardDescription>Shipments and cancellations by day — most recent first.</CardDescription>
        </CardHeader>
        <AsyncBoundary
          state={revenue.state}
          onRetry={revenue.refetch}
          label="Revenue"
          empty={<div className="px-5 pb-5"><EmptyState icon={<TrendingUp className="size-6" />} title="No shipments yet" /></div>}
        >
          {/* Desktop / tablet: full table, scrolls horizontally only if the viewport is still tight */}
          <div className="hidden overflow-x-auto px-5 pb-5 md:block">
            <table className="w-full min-w-[520px] text-sm font-tabular">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-fg">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Shipments delivered</th>
                  <th className="py-2 pr-3 font-medium">Revenue</th>
                  <th className="py-2 font-medium">Cancelled</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((d) => (
                  <tr key={d.date} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">{d.date}</td>
                    <td className="py-2 pr-3">{d.shipments}</td>
                    <td className="py-2 pr-3 font-medium font-tabular">रू {d.grossRevenue.toLocaleString()}</td>
                    <td className="py-2 text-muted-fg">{d.cancelled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: one card per day instead of a cramped, horizontally-scrolling table */}
          <div className="space-y-3 px-5 pb-5 font-tabular md:hidden">
            {dailyRows.map((d) => (
              <div key={d.date} className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{d.date}</span>
                  <span className="text-sm font-semibold text-fg font-tabular">रू {d.grossRevenue.toLocaleString()}</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-fg">Shipments delivered</dt>
                    <dd className="font-medium text-fg">{d.shipments}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-fg">Cancelled</dt>
                    <dd className="font-medium text-fg">{d.cancelled}</dd>
                  </div>
                </dl>
              </div>
            ))} 
          </div>
        </AsyncBoundary>
      </Card>
    </div>
  );
}