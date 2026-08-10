import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { RevenueAreaChart } from "@/components/shared/revenue-area-chart";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import { npr } from "@/lib/utils";
import type { PartnerFoodRevenue } from "./types";

export function RestaurantRevenuePage() {
  const revenue = useResource<PartnerFoodRevenue>(() => api.get(endpoints.restaurants.partner.revenue), []);
  const s = revenue.data?.summary;

  const categories = (revenue.data?.daily ?? []).map((d) =>
    new Date(d.date).toLocaleDateString("en-NP", { month: "short", day: "numeric" }),
  );
  const netProfitSeries = (revenue.data?.daily ?? []).map((d) => d.netProfit);
  const dailyRows = [...(revenue.data?.daily ?? [])].reverse().filter((d) => d.orders > 0 || d.cancelled > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue" subtitle="Daily earnings, platform fees, and refunds across your restaurants." />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Revenue (today)" icon="Banknote" state={revenue.state} value={s ? npr(s.todayRevenue, { compact: true }) : undefined} caption="Net profit from today's orders" />
        <StatCard label="Revenue (this month)" icon="TrendingUp" state={revenue.state} value={s ? npr(s.monthRevenue, { compact: true }) : undefined} caption="Net profit so far this month" />
        <StatCard label="Total revenue" icon="Wallet" state={revenue.state} value={s ? npr(s.totalRevenue, { compact: true }) : undefined} caption="All-time, confirmed orders" />
        <StatCard label="Platform fee (not yours)" icon="ArrowLeftRight" state={revenue.state} value={s ? npr(s.totalPlatformFee, { compact: true }) : undefined} caption="Zamzam's 2% order commission" />
        <StatCard label="Refunded" icon="AlertTriangle" state={revenue.state} value={s ? npr(s.totalRefunded, { compact: true }) : undefined} caption={s ? `${s.totalCancelled} cancelled order(s)` : undefined} />
        <StatCard label="Avg. order value" icon="Star" state={revenue.state} value={s ? npr(s.avgOrderValue, { compact: true }) : undefined} caption={s ? `${s.totalOrders} confirmed order(s)` : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily net profit</CardTitle>
          <CardDescription>Last 30 days — the order revenue you keep, after excluding cancellations.</CardDescription>
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
                description="This chart fills in as orders come through."
              />
            }
          >
            <RevenueAreaChart
              categories={categories}
              series={[{ name: "Net profit", color: "#10B981", data: netProfitSeries }]}
              height={280}
            />
          </AsyncBoundary>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily breakdown</CardTitle>
          <CardDescription>Orders, fees, and refunds by day — most recent first.</CardDescription>
        </CardHeader>
        <AsyncBoundary
          state={revenue.state}
          onRetry={revenue.refetch}
          label="Revenue"
          empty={<div className="px-5 pb-5"><EmptyState icon={<TrendingUp className="size-6" />} title="No orders yet" /></div>}
        >
          {/* Desktop / tablet: full table, scrolls horizontally only if the viewport is still tight */}
          <div className="hidden overflow-x-auto px-5 pb-5 md:block">
            <table className="w-full min-w-[640px] text-sm font-tabular">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-fg">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Orders</th>
                  <th className="py-2 pr-3 font-medium">Gross revenue</th>
                  <th className="py-2 pr-3 font-medium">Platform fee</th>
                  <th className="py-2 pr-3 font-medium">Net profit</th>
                  <th className="py-2 pr-3 font-medium">Cancelled</th>
                  <th className="py-2 font-medium">Refunded</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((d) => (
                  <tr key={d.date} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">{d.date}</td>
                    <td className="py-2 pr-3">{d.orders}</td>
                    <td className="py-2 pr-3 font-tabular">रू {d.grossRevenue.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-muted-fg">रू {d.platformFee.toLocaleString()}</td>
                    <td className="py-2 pr-3 font-medium">रू {d.netProfit.toLocaleString()}</td>
                    <td className="py-2 pr-3">{d.cancelled}</td>
                    <td className="py-2 text-muted-fg">रू {d.refunded.toLocaleString()}</td>
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
                  <span className="text-sm font-semibold text-fg">रू {d.netProfit.toLocaleString()}</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-fg">Orders</dt>
                    <dd className="font-medium text-fg">{d.orders}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-fg">Cancelled</dt>
                    <dd className="font-medium text-fg">{d.cancelled}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-fg">Gross revenue</dt>
                    <dd className="font-medium text-fg font-tabular">रू {d.grossRevenue.toLocaleString()}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-fg">Platform fee</dt>
                    <dd className="font-medium text-fg">रू {d.platformFee.toLocaleString()}</dd>
                  </div>
                  <div className="col-span-2 flex items-center justify-between">
                    <dt className="text-muted-fg">Refunded</dt>
                    <dd className="font-medium text-fg">रू {d.refunded.toLocaleString()}</dd>
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