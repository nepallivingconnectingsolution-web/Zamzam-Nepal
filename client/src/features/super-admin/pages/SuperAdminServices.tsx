import { useMemo, useState } from "react";
import { ChevronRight, RefreshCcw } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AsyncBoundary } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { npr } from "@/lib/utils";
import { toast } from "@/stores/toast.store";

/*
 * Fully data-driven: this page renders whatever the Service Registry on the
 * server reports. When a new vertical is registered there, its card, toggle
 * and bookings drill-down appear here automatically — no changes needed.
 */

interface ServiceCard {
  key: string;
  label: string;
  category: string;
  enabled: boolean;
  bookings30d: number;
  value30d: number;
  openNow: number;
}

interface ServiceBookingsResponse {
  service: { key: string; label: string; category: string };
  rows: {
    id: string;
    title: string;
    status: string;
    amount: number | null;
    createdAt: string;
    customer: { name: string; mobile: string | null } | null;
    provider: string | null;
  }[];
}

const PAGE_SIZE = 20;

export function SuperAdminServices() {
  const { saApi } = useSuperAdminApi();
  const overview = useResource<{ windowDays: number; services: ServiceCard[] }>(() =>
    saApi("/super-admin/services"),
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [toggling, setToggling] = useState<string | null>(null);

  const detail = useResource<ServiceBookingsResponse | null>(
    () =>
      selected
        ? saApi(`/super-admin/services/${selected}/bookings?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`)
        : Promise.resolve(null),
    [selected, page],
  );

  const grouped = useMemo(() => {
    const by = new Map<string, ServiceCard[]>();
    for (const s of overview.data?.services ?? []) {
      by.set(s.category, [...(by.get(s.category) ?? []), s]);
    }
    return [...by.entries()];
  }, [overview.data]);

  function openDetail(key: string) {
    setSelected(key);
    setPage(0);
  }

  async function toggle(svc: ServiceCard) {
    setToggling(svc.key);
    try {
      // Control reuses the existing audited CMS flag endpoint — one switch,
      // one source of truth, visible both here and on the CMS page.
      await saApi("/super-admin/cms", {
        method: "PATCH",
        body: { serviceFlags: { [svc.key]: !svc.enabled } },
      });
      toast.success(
        svc.enabled ? `${svc.label} switched off` : `${svc.label} is live`,
        svc.enabled ? "Hidden from customers until re-enabled." : "Visible to customers again.",
      );
      overview.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the service.");
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Services"
        subtitle={`Every vertical on the platform — last ${overview.data?.windowDays ?? 30} days at a glance.`}
        actions={
          <Button variant="outline" onClick={() => overview.refetch()}>
            <RefreshCcw /> Refresh
          </Button>
        }
      />

      <AsyncBoundary state={overview.state} onRetry={overview.refetch} label="Services">
        <div className="space-y-6">
          {grouped.map(([category, services]) => (
            <div key={category} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-fg">{category}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {services.map((s) => (
                  <Card key={s.key} className={`p-5 ${s.enabled ? "" : "opacity-70"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{s.label}</p>
                      <button
                        onClick={() => toggle(s)}
                        disabled={toggling === s.key}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                          s.enabled ? "bg-accent/15 text-accent" : "bg-muted text-muted-fg"
                        }`}
                        title={s.enabled ? "Click to switch off" : "Click to go live"}
                      >
                        {toggling === s.key ? "…" : s.enabled ? "Live" : "Off"}
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="font-display text-lg font-semibold">{s.bookings30d}</p>
                        <p className="text-xs text-muted-fg">bookings</p>
                      </div>
                      <div>
                        <p className="font-display text-lg font-semibold">{npr(s.value30d)}</p>
                        <p className="text-xs text-muted-fg">value</p>
                      </div>
                      <div>
                        <p className="font-display text-lg font-semibold">{s.openNow}</p>
                        <p className="text-xs text-muted-fg">open now</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => openDetail(s.key)}>
                      View bookings <ChevronRight className="size-3.5" />
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </AsyncBoundary>

      {selected && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>{detail.data?.service.label ?? selected} — recent bookings</CardTitle>
              <CardDescription>Newest first, {PAGE_SIZE} per page.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
          </CardHeader>
          <div className="px-5 pb-5">
            <AsyncBoundary state={detail.state} onRetry={detail.refetch} label="Bookings">
              {detail.data && detail.data.rows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-fg">
                  {page === 0 ? "No bookings for this service yet." : "No more bookings."}
                </p>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {detail.data?.rows.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.title}</p>
                        <p className="truncate text-xs text-muted-fg">
                          {r.customer?.name ?? "—"}
                          {r.provider ? ` · via ${r.provider}` : ""} ·{" "}
                          {new Date(r.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span className="text-sm font-medium">{r.amount != null ? npr(r.amount) : "—"}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {r.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </AsyncBoundary>
            <div className="mt-3 flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-xs text-muted-fg">Page {page + 1}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={(detail.data?.rows.length ?? 0) < PAGE_SIZE}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}