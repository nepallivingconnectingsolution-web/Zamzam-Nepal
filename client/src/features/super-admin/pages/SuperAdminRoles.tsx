import { Check, Minus, ShieldCheck, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";

interface RolesData {
  roles: { role: string; total: number; pending: number; approved: number; suspended: number }[];
  superAdminCount: number;
}

/**
 * Access control is enforced in code (RolesGuard on every portal route +
 * the separate super-admin auth domain), so this page documents that
 * matrix and shows the live role distribution with per-role KYC health.
 * Role changes happen through registration + KYC approval, never by
 * editing a role directly — that's why there is no "edit role" button.
 */
const PERMISSIONS: { area: string; roles: Record<string, boolean> }[] = [
  { area: "Book rides, buses, hotels, food, grocery", roles: { customer: true } },
  { area: "Accept & complete rides / parcels", roles: { driver: true } },
  { area: "Publish bus routes & schedules", roles: { bus_operator: true } },
  { area: "Manage properties & room bookings", roles: { hotel: true } },
  { area: "Manage menus & food orders", roles: { restaurant: true } },
  { area: "Manage catalog & grocery orders", roles: { grocery: true } },
  { area: "Bid on & haul freight loads", roles: { freight: true } },
  { area: "KYC approvals, disputes, settings, audit", roles: {} }, // super admin only
];

const ROLE_ORDER = ["customer", "driver", "bus_operator", "hotel", "restaurant", "grocery", "freight", "admin"];

export function SuperAdminRoles() {
  const { saApi } = useSuperAdminApi();
  const roles = useResource<RolesData>(() => saApi("/super-admin/roles"));
  const d = roles.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Roles" subtitle="Live role distribution and the platform's access-control matrix." />

      <Card>
        <CardHeader>
          <CardTitle>Role distribution</CardTitle>
          <CardDescription>
            Every account holds exactly one role, granted at registration and gated by KYC approval.
            {d ? ` ${d.superAdminCount} super admin account${d.superAdminCount === 1 ? "" : "s"} exist outside this table.` : ""}
          </CardDescription>
        </CardHeader>
        <AsyncBoundary
          state={roles.state}
          onRetry={roles.refetch}
          label="Roles"
          empty={
            <div className="px-5 py-10">
              <EmptyState
                icon={<UsersRound className="size-6 text-muted-fg" />}
                title="No accounts yet"
                description="Role counts appear as users register."
              />
            </div>
          }
        >
          {/* Desktop / tablet: full table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-xs font-semibold text-muted-fg">
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Accounts</th>
                  <th className="px-5 py-3">Approved</th>
                  <th className="px-5 py-3">Pending KYC</th>
                  <th className="px-5 py-3">Suspended</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(d?.roles ?? []).map((r) => (
                  <tr key={r.role} className="transition-colors hover:bg-surface-2/50">
                    <td className="px-5 py-3">
                      <Badge variant="outline" className="text-[10px]">{r.role}</Badge>
                    </td>
                    <td className="px-5 py-3 font-semibold">{r.total}</td>
                    <td className="px-5 py-3 text-success">{r.approved}</td>
                    <td className="px-5 py-3">{r.pending > 0 ? <span className="font-medium text-warning">{r.pending}</span> : "0"}</td>
                    <td className="px-5 py-3">{r.suspended > 0 ? <span className="font-medium text-danger">{r.suspended}</span> : "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: one card per role instead of a cramped, horizontally-scrolling table */}
          <div className="space-y-3 p-4 md:hidden">
            {(d?.roles ?? []).map((r) => (
              <div key={r.role} className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px]">{r.role}</Badge>
                  <span className="text-sm font-semibold text-fg">{r.total} account{r.total === 1 ? "" : "s"}</span>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                  <div>
                    <dt className="text-muted-fg">Approved</dt>
                    <dd className="font-medium text-success">{r.approved}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-fg">Pending KYC</dt>
                    <dd className={r.pending > 0 ? "font-medium text-warning" : "font-medium text-fg"}>{r.pending}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-fg">Suspended</dt>
                    <dd className={r.suspended > 0 ? "font-medium text-danger" : "font-medium text-fg"}>{r.suspended}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </AsyncBoundary>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-fg" /> Access matrix
          </CardTitle>
          <CardDescription>
            Enforced in code by RolesGuard on every portal route. The last row is reserved for the
            separate super-admin auth domain — no regular role can reach it.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs font-semibold text-muted-fg">
                <th className="sticky left-0 z-10 bg-surface-2 px-5 py-3">Capability</th>
                {ROLE_ORDER.filter((r) => r !== "admin").map((r) => (
                  <th key={r} className="px-3 py-3 text-center">{r.replace("_", " ")}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {PERMISSIONS.map((p) => (
                <tr key={p.area}>
                  <td className="sticky left-0 z-10 bg-surface px-5 py-3 text-xs">{p.area}</td>
                  {ROLE_ORDER.filter((r) => r !== "admin").map((r) => (
                    <td key={r} className="px-3 py-3 text-center">
                      {p.roles[r] ? (
                        <Check className="mx-auto size-4 text-success" />
                      ) : (
                        <Minus className="mx-auto size-3.5 text-muted-fg/40" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-5 py-2 text-xs text-muted-fg md:hidden">
          Swipe left to see all roles — the capability column stays pinned.
        </p>
      </Card>
    </div>
  );
}