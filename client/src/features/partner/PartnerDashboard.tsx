import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api } from "@/api/client";
import { npr } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

type KpiFormat = "number" | "currency" | "percent" | "rating";

interface KpiSpec {
  label: string;
  icon: string;
  /** Field on the metrics object to read the value from. */
  key?: string;
  format?: KpiFormat;
}

interface PartnerMetrics {
  series: { label: string; value: number }[];
  [k: string]: unknown;
}

function formatValue(v: unknown, format?: KpiFormat): string {
  if (v == null) return "—";
  const n = Number(v);
  if (format === "currency") return npr(n, { compact: true });
  if (format === "percent") return `${n}%`;
  if (format === "rating") return `${n.toFixed(1)} ★`;
  return n.toLocaleString("en-NP");
}

/** One overview surface shared by hotel, bus-operator and freight partners. */
export function PartnerDashboard({
  title,
  subtitle,
  kpis,
  metricsPath,
  chartTitle,
  chartCaption,
}: {
  title: string;
  subtitle: string;
  kpis: KpiSpec[];
  metricsPath: string;
  chartTitle: string;
  chartCaption: string;
}) {
  const metrics = useResource<PartnerMetrics>(() => api.get(metricsPath), [metricsPath]);
  const series = useMemo(() => metrics.data?.series ?? [], [metrics.data]);

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <StatCard
            key={k.label}
            label={k.label}
            icon={k.icon}
            state={metrics.state}
            value={k.key ? formatValue(metrics.data?.[k.key], k.format) : "—"}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{chartTitle}</CardTitle>
          <CardDescription>{chartCaption}</CardDescription>
        </CardHeader>
        <div className="px-5 pb-5">
          <AsyncBoundary
            state={metrics.state}
            onRetry={metrics.refetch}
            label={chartTitle}
            empty={
              <EmptyState
                icon={<TrendingUp className="size-6 text-muted-fg" />}
                title="No data yet"
                description="This chart builds from your live bookings and revenue."
              />
            }
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="partnerFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "hsl(var(--muted-fg))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-fg))" }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2.5} fill="url(#partnerFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </AsyncBoundary>
        </div>
      </Card>
    </div>
  );
}
