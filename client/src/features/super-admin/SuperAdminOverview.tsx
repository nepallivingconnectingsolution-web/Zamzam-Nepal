import { AlertTriangle, Download, Eye, Map, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";

interface Metrics {
  gmv: number;
  activeTrips: number;
  onlineDrivers: number;
  newUsers24h: number;
  totalUsers: number;
  openDisputes: number;
  revenue30d: number;
  currency: string;
}

interface UserRow {
  id: string;
  name: string;
  mobile: string;
  role: string;
  kycStatus: string;
}

/** Shape returned by paginated list endpoints like /super-admin/users. */
interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

interface DisputeRow {
  id: string;
  subject: string;
  status: string;
  amount?: string;
}

export function SuperAdminOverview() {
  const { saApi } = useSuperAdminApi();
  const navigate = useNavigate();

  const metrics = useResource<Metrics>(() => saApi<Metrics>("/super-admin/metrics"));
  // /super-admin/users returns { items, total, limit, offset }; unwrap to a
  // plain array here so useResource's array-based empty-state detection
  // (Array.isArray(result) && result.length === 0) still works correctly.
  const recentUsers = useResource<UserRow[]>(async () => {
    const res = await saApi<Paginated<UserRow>>("/super-admin/users?limit=5");
    return res.items;
  });
  const recentDisputes = useResource<DisputeRow[]>(() =>
    saApi<DisputeRow[]>("/super-admin/disputes?limit=5"),
  );

  const fmt = (n?: number) =>
    n !== undefined ? `रू ${n.toLocaleString("en-NP")}` : "रू 0";

  return (
    <div className="space-y-6">
      <PageHeader
        title="360° Command Center"
        subtitle="Complete visibility across every Zamzam operation."
        actions={
          <>
            <Badge variant="success" className="hidden sm:inline-flex">
              <span className="size-1.5 rounded-full bg-success" /> Live
            </Badge>
            <Button variant="outline" size="sm">
              <Download className="size-4" /> Export
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="GMV (today)"      icon="Wallet"    state={metrics.state} value={fmt(metrics.data?.gmv)}           caption="gross volume" />
        <StatCard label="Active trips"     icon="Navigation" state={metrics.state} value={metrics.data?.activeTrips ?? 0}  caption="in progress" />
        <StatCard label="Online drivers"   icon="Car"       state={metrics.state} value={metrics.data?.onlineDrivers ?? 0} caption="valley-wide" />
        <StatCard label="New users (24h)"  icon="UserPlus"  state={metrics.state} value={metrics.data?.newUsers24h ?? 0}   caption="signups" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users"    icon="Users"         state={metrics.state} value={metrics.data?.totalUsers ?? 0}    caption="all time" />
        <StatCard label="Open disputes"  icon="AlertTriangle" state={metrics.state} value={metrics.data?.openDisputes ?? 0}  caption="need attention" />
        <StatCard label="Revenue (30d)"  icon="TrendingUp"    state={metrics.state} value={fmt(metrics.data?.revenue30d)}    caption="commission earned" />
        <StatCard label="System health"  icon="ShieldCheck"   state={metrics.state} value="Nominal"                          caption="all services up" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-muted-fg" /> Recent registrations
            </CardTitle>
            <CardDescription>Latest accounts across all roles.</CardDescription>
          </CardHeader>
          <div className="min-w-0 px-5 pb-5">
            <AsyncBoundary
              state={recentUsers.state}
              onRetry={recentUsers.refetch}
              label="Recent users"
              empty={
                <EmptyState
                  icon={<Users className="size-6 text-muted-fg" />}
                  title="No users yet"
                  description="New registrations appear here."
                />
              }
            >
            <ul className="min-w-0 divide-y divide-border">
                {(recentUsers.data ?? []).map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 text-sm">
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate font-medium">{u.name}</p>
                      <p className="truncate text-xs text-muted-fg">{u.mobile}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="max-w-[100px] truncate text-[10px]">{u.role}</Badge>
                      <button
                        type="button"
                        title="Review registration"
                        aria-label="Review registration"
                        onClick={() => navigate(`/x-admin/registrations/${u.id}`)}
                        className="rounded-full p-1.5 text-muted-fg hover:bg-surface-2 hover:text-fg"
                      >
                        <Eye className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>  
            </AsyncBoundary>
          </div>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-muted-fg" /> Open disputes
            </CardTitle>
            <CardDescription>Items needing super-admin resolution.</CardDescription>
          </CardHeader>
          <div className="min-w-0 px-5 pb-5">
            <AsyncBoundary
              state={recentDisputes.state}
              onRetry={recentDisputes.refetch}
              label="Disputes"
              empty={
                <EmptyState
                  icon={<ShieldCheck className="size-6 text-muted-fg" />}
                  title="All clear"
                  description="No open disputes."
                />
              }
            >
              <ul className="min-w-0 divide-y divide-border">
                {(recentDisputes.data ?? []).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 text-sm">
                    <p className="min-w-0 flex-1 basis-40 truncate font-medium">{d.subject}</p>
                    <Badge
                      variant={d.status === "OPEN" ? "danger" : "success"}
                      className="max-w-[110px] shrink-0 truncate text-[10px]"
                    >
                      {d.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </AsyncBoundary>
          </div>
        </Card>
      </div>
    </div>
  );
}