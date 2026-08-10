import { useEffect, useMemo, useState } from "react";
import { Route } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { npr } from "@/lib/utils";

interface RideRow {
  id: string;
  service: string;
  status: string;
  fromLabel: string;
  toLabel: string;
  fare: number;
  distanceKm: number | null;
  customer: { name: string; mobile: string | null } | null;
  driver: { name: string; mobile: string | null } | null;
  createdAt: string;
}

interface RidesResponse {
  items: RideRow[];
  total: number;
}

const PAGE_SIZE = 50;
const STATUSES = ["all", "REQUESTED", "ACCEPTED", "ONGOING", "COMPLETED", "CANCELLED"] as const;
const SERVICES = ["all", "taxi", "bike", "parcel"] as const;

function statusVariant(s: string): "success" | "danger" | "warning" | "outline" {
  if (s === "COMPLETED") return "success";
  if (s === "CANCELLED") return "danger";
  if (s === "ONGOING" || s === "ACCEPTED") return "warning";
  return "outline";
}

/** All rides and parcels platform-wide with status/service filters and pagination. */
export function SuperAdminRides() {
  const { saApi } = useSuperAdminApi();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [service, setService] = useState<(typeof SERVICES)[number]>("all");
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [status, service]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));
    if (status !== "all") params.set("status", status);
    if (service !== "all") params.set("service", service);
    return params.toString();
  }, [status, service, page]);

  const rides = useResource<RidesResponse>(() => saApi(`/super-admin/rides?${query}`), [query]);

  const total = rides.data?.total ?? 0;
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Rides" subtitle="All rides and parcel deliveries across the platform." />

      <Card>
        <div className="space-y-3 border-b border-border px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  status === s
                    ? "border-teal-700 bg-teal-100 text-teal-700 dark:border-accent dark:bg-white/10 dark:text-accent"
                    : "border-border text-muted-fg hover:border-accent/50"
                }`}
              >
                {s === "all" ? "All statuses" : s.toLowerCase()}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {SERVICES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setService(s)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  service === s
                    ? "border-teal-700 bg-teal-100 text-teal-700 dark:border-accent dark:bg-white/10 dark:text-accent"
                    : "border-border text-muted-fg hover:border-accent/50"
                }`}
              >
                {s === "all" ? "All services" : s}
              </button>
            ))}
          </div>
        </div>

        <AsyncBoundary
          state={rides.state}
          onRetry={rides.refetch}
          label="Rides"
          empty={
            <div className="px-5 py-10">
              <EmptyState
                icon={<Route className="size-6 text-muted-fg" />}
                title="No rides found"
                description="Try a different filter."
              />
            </div>
          }
        >
          {/* Desktop / tablet: full table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm font-tabular">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-xs font-semibold text-muted-fg">
                  <th className="px-5 py-3">Route</th>
                  <th className="px-5 py-3">Service</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Driver</th>
                  <th className="px-5 py-3">Fare</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Requested</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(rides.data?.items ?? []).map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface-2/50">
                    <td className="max-w-xs px-5 py-3">
                      <p className="truncate font-medium" title={`${r.fromLabel} → ${r.toLabel}`}>
                        {r.fromLabel} → {r.toLabel}
                      </p>
                      {r.distanceKm != null && <p className="text-xs text-muted-fg">{r.distanceKm.toFixed(1)} km</p>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="outline" className="text-[10px]">{r.service}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      {r.customer ? (
                        <>
                          <p className="font-medium">{r.customer.name}</p>
                          {r.customer.mobile && <p className="text-xs text-muted-fg">{r.customer.mobile}</p>}
                        </>
                      ) : (
                        <span className="text-xs text-muted-fg">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {r.driver ? (
                        <>
                          <p className="font-medium">{r.driver.name}</p>
                          {r.driver.mobile && <p className="text-xs text-muted-fg">{r.driver.mobile}</p>}
                        </>
                      ) : (
                        <span className="text-xs text-muted-fg">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-semibold">{npr(r.fare)}</td>
                    <td className="px-5 py-3">
                      <Badge variant={statusVariant(r.status)} className="text-[10px]">
                        {r.status.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-fg">
                      {new Date(r.createdAt).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: one card per ride instead of a cramped, horizontally-scrolling table */}
          <div className="space-y-3 p-4 font-tabular md:hidden">
            {(rides.data?.items ?? []).map((r) => (
              <div key={r.id} className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium" title={`${r.fromLabel} → ${r.toLabel}`}>
                      {r.fromLabel} → {r.toLabel}
                    </p>
                    {r.distanceKm != null && <p className="text-xs text-muted-fg">{r.distanceKm.toFixed(1)} km</p>}
                  </div>
                  <Badge variant={statusVariant(r.status)} className="shrink-0 text-[10px]">
                    {r.status.toLowerCase()}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{r.service}</Badge>
                  <span className="text-xs font-semibold text-fg">{npr(r.fare)}</span>
                  <span className="text-xs text-muted-fg">
                    {new Date(r.createdAt).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div>
                    <dt className="text-muted-fg">Customer</dt>
                    {r.customer ? (
                      <dd className="font-medium text-fg">
                        {r.customer.name}
                        {r.customer.mobile && <span className="block text-muted-fg">{r.customer.mobile}</span>}
                      </dd>
                    ) : (
                      <dd className="text-muted-fg">—</dd>
                    )}
                  </div>
                  <div>
                    <dt className="text-muted-fg">Driver</dt>
                    {r.driver ? (
                      <dd className="font-medium text-fg">
                        {r.driver.name}
                        {r.driver.mobile && <span className="block text-muted-fg">{r.driver.mobile}</span>}
                      </dd>
                    ) : (
                      <dd className="text-muted-fg">Unassigned</dd>
                    )}
                  </div>
                </dl>
              </div>
            ))}
          </div>

          {/* Pagination: kept outside the scroll area so it's always reachable without scrolling right */}
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-xs text-muted-fg">
              Page {page + 1} of {pageCount} · {total} rides
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </AsyncBoundary>
      </Card>
    </div>
  );
}