import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AsyncBoundary } from "@/components/shared/async-states";
import { RevenueAreaChart, type RevenueSeries } from "@/components/shared/revenue-area-chart";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { npr } from "@/lib/utils";

/*
 * Fully registry-driven: cards and chart render whatever services the
 * backend reports. New verticals appear here automatically.
 */

interface ServiceRevenue {
  key: string;
  label: string;
  category: string;
  bookings30d: number;
  value30d: number;
  openNow: number;
}

interface RevenueResponse {
  windowDays: number;
  services: ServiceRevenue[];
  combined: { value30d: number; bookings30d: number };
  daily: ({ date: string } & Record<string, number | string>)[];
}

const SERVICE_ICONS: Record<string, string> = {
  bike: "Bike",
  taxi: "CarFront",
  parcel: "Package",
  freight: "Truck",
  bus: "Bus",
  hotel: "BedDouble",
  food: "UtensilsCrossed",
  grocery: "ShoppingBasket",
};

/** Line colors cycle through this palette, so any number of services works. */
const PALETTE = ["#10B981", "#8B5CF6", "#38BDF8", "#F59E0B", "#F43F5E", "#14B8A6", "#6366F1", "#84CC16"];

export function SuperAdminRevenue() {
  const { saApi } = useSuperAdminApi();
  const revenue = useResource<RevenueResponse>(() => saApi<RevenueResponse>("/super-admin/revenue"), []);
  const d = revenue.data;

  const categories = (d?.daily ?? []).map((p) =>
    new Date(p.date).toLocaleDateString("en-NP", { month: "short", day: "numeric" }),
  );
  const series: RevenueSeries[] = (d?.services ?? []).map((s, i) => ({
    name: s.label,
    color: PALETTE[i % PALETTE.length],
    data: (d?.daily ?? []).map((p) => Number(p[s.key] ?? 0)),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue"
        subtitle={`Gross earnings across every service on the platform — last ${d?.windowDays ?? 30} days.`}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Combined revenue"
          icon="Wallet"
          state={revenue.state}
          value={d ? npr(d.combined.value30d, { compact: true }) : undefined}
          caption={d ? `${d.combined.bookings30d} bookings/orders in ${d.windowDays} days` : undefined}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(d?.services ?? []).map((s) => (
          <StatCard
            key={s.key}
            label={s.label}
            icon={SERVICE_ICONS[s.key] ?? "Wallet"}
            state={revenue.state}
            value={npr(s.value30d, { compact: true })}
            caption={`${s.bookings30d} bookings · ${s.openNow} open now`}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily earnings — last {d?.windowDays ?? 30} days</CardTitle>
          <CardDescription>Every service, side by side. Click legend entries to isolate lines.</CardDescription>
        </CardHeader>
        <div className="px-5 pb-5">
          <AsyncBoundary state={revenue.state} onRetry={revenue.refetch} label="Revenue">
            <RevenueAreaChart categories={categories} series={series} height={340} />
          </AsyncBoundary>
        </div>
      </Card>
    </div>
  );
}