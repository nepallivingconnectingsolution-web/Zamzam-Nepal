import { Download, Map, TrendingUp, ShieldAlert } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import { npr } from "@/lib/utils";

interface Metrics {
  gmv: number;
  activeTrips: number;
  onlineDrivers: number;
  newUsers24h: number;
}
interface RevenuePoint {
  label: string;
  value: number;
}
interface Dispute {
  id: string;
  subject: string;
  status: string;
  amount: string;
  createdAt: string;
}

const BAR_COLORS = ["#10B981", "#0EA5E9", "#6366F1", "#F59E0B"];

export function AdminOverview() {
  const metrics = useResource<Metrics>(() => api.get(endpoints.admin.metrics));
  const revenue = useResource<RevenuePoint[]>(() => api.get(endpoints.admin.revenue));
  const disputes = useResource<Dispute[]>(() => api.get(endpoints.admin.disputes));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Command center"
        subtitle="Live health of the entire Zamzam ecosystem."
        actions={
          <>
            <Badge variant="success" className="hidden sm:inline-flex">
              <span className="size-1.5 rounded-full bg-success" /> Systems nominal
            </Badge>
            <Button variant="outline" size="sm">
              <Download className="size-4" /> Export
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="GMV (today)" icon="Wallet" state={metrics.state} value={npr(metrics.data?.gmv ?? 0, { compact: true })} caption="gross volume" />
        <StatCard label="Active trips" icon="Navigation" state={metrics.state} value={metrics.data?.activeTrips ?? 0} caption="in progress" />
        <StatCard label="Online drivers" icon="Car" state={metrics.state} value={metrics.data?.onlineDrivers ?? 0} caption="valley-wide" />
        <StatCard label="New users (24h)" icon="UserPlus" state={metrics.state} value={metrics.data?.newUsers24h ?? 0} caption="signups" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by vertical</CardTitle>
            <CardDescription>Commission split across mobility, freight, bus, tourism.</CardDescription>
          </CardHeader>
          <div className="px-5 pb-5">
            <AsyncBoundary
              state={revenue.state}
              onRetry={revenue.refetch}
              label="Revenue analytics"
              empty={
                <EmptyState
                  icon={<TrendingUp className="size-6 text-muted-fg" />}
                  title="No revenue recorded yet"
                  description="Charts populate from the settlement ledger once the platform processes its first transactions."
                />
              }
            >
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenue.data ?? []} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "hsl(var(--muted-fg))" }} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-fg))" }}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tickFormatter={(v: number) => npr(v, { compact: true })}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                      formatter={(v: number) => [npr(v, { compact: true }), "Revenue"]}
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={56}>
                      {(revenue.data ?? []).map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AsyncBoundary>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Demand heatmap</CardTitle>
            <CardDescription>Kathmandu Valley, last 60 minutes.</CardDescription>
          </CardHeader>
          <div className="px-5 pb-5">
            <div className="relative grid h-64 place-items-center overflow-hidden rounded-xl border border-border">
              <div className="absolute inset-0 valley-grid opacity-70" aria-hidden />
              <EmptyState
                className="border-0 bg-transparent py-0"
                icon={<Map className="size-6 text-muted-fg" />}
                title="Waiting for live demand"
                description="GPS streaming renders ride density here in real time."
              />
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open disputes & fraud flags</CardTitle>
          <CardDescription>Items needing operator attention.</CardDescription>
        </CardHeader>
        <div className="px-5 pb-5">
          <AsyncBoundary
            state={disputes.state}
            onRetry={disputes.refetch}
            label="Disputes and fraud flags"
            empty={
              <EmptyState
                icon={<TrendingUp className="size-6 text-success" />}
                title="All clear"
                description="No open disputes or fraud flags. New cases surface here the moment they're raised."
              />
            }
          >
            <div className="space-y-2">
              {(disputes.data ?? []).map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning">
                      <ShieldAlert className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.subject}</p>
                      <p className="text-xs text-muted-fg">{d.amount} · disputed</p>
                    </div>
                  </div>
                  <Badge variant={d.status === "OPEN" ? "warning" : "default"}>{d.status}</Badge>
                </div>
              ))}
            </div>
          </AsyncBoundary>
        </div>
      </Card>
    </div>
  );
}
