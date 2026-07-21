import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { RevenueAreaChart } from "@/components/shared/revenue-area-chart";
import { npr } from "@/lib/utils";
import { useDriverPortal } from "./driver-portal.context";

export function DriverEarningsPage() {
  const { earnings } = useDriverPortal();
  const series = earnings.data?.series ?? [];
  const categories = series.map((d) => d.label);
  const values = series.map((d) => d.value);

  return (
    <div className="space-y-6">
      <PageHeader title="Earnings" subtitle="Daily settlements and breakdowns, from your completed trips." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Today's earnings" icon="Banknote" state={earnings.state} value={npr(earnings.data?.today ?? 0)} caption="today so far" />
        <StatCard label="Last 7 days" icon="TrendingUp" state={earnings.state} value={npr(earnings.data?.week ?? 0)} caption="rolling week" />
        <StatCard label="Trips today" icon="Route" state={earnings.state} value={earnings.data?.tripsToday ?? 0} caption="completed" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Earnings this week</CardTitle>
        </CardHeader>
        <div className="px-5 pb-5">
          <AsyncBoundary
            state={earnings.state}
            onRetry={earnings.refetch}
            label="Your earnings"
            empty={
              <EmptyState
                icon={<TrendingUp className="size-6 text-muted-fg" />}
                title="No earnings yet"
                description="Complete your first trip and your daily earnings chart will build here."
              />
            }
          >
            <RevenueAreaChart
              categories={categories}
              series={[{ name: "Earned", color: "#10B981", data: values }]}
              height={280}
            />
          </AsyncBoundary>
        </div>
      </Card>

      <p className="text-xs text-muted-fg">
        Figures are computed from your completed rides directly — fares are collected in person and aren't
        routed through your Zamzam wallet automatically yet, so this total won't match your Wallet balance.
      </p>
    </div>
  );
}