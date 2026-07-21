import { useEffect, useMemo, useState } from "react";
import { ScrollText, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";

interface AuditRow {
  id: string;
  actor: { name: string; email: string | null; type: "super_admin" | "user" };
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

interface AuditResponse {
  items: AuditRow[];
  total: number;
}

const PAGE_SIZE = 50;

/** Every privileged action — who did what, to what, and when. Read-only by design. */
export function SuperAdminAudit() {
  const { saApi } = useSuperAdminApi();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [search]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));
    if (search) params.set("q", search);
    return params.toString();
  }, [search, page]);

  const audit = useResource<AuditResponse>(() => saApi(`/super-admin/audit?${query}`), [query]);

  const total = audit.data?.total ?? 0;
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" subtitle="All privileged actions with actor, target and time." />

      <Card>
        <div className="border-b border-border px-5 py-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />
            <Input
              placeholder="Search action or target id…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <AsyncBoundary
          state={audit.state}
          onRetry={audit.refetch}
          label="Audit events"
          empty={
            <div className="px-5 py-10">
              <EmptyState
                icon={<ScrollText className="size-6 text-muted-fg" />}
                title="No audit events yet"
                description="KYC decisions, settings changes and dispute resolutions are recorded here."
              />
            </div>
          }
        >
          {/* Desktop / tablet: full table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-xs font-semibold text-muted-fg">
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Target</th>
                  <th className="px-5 py-3">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(audit.data?.items ?? []).map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-surface-2/50">
                    <td className="px-5 py-3">
                      <p className="font-medium">{e.actor.name}</p>
                      <Badge variant="outline" className="mt-0.5 text-[10px]">
                        {e.actor.type === "super_admin" ? "super admin" : "user"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{e.action}</code>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-fg">
                      {e.targetType ? (
                        <>
                          <p>{e.targetType}</p>
                          {e.targetId && <p className="font-mono">{e.targetId}</p>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-fg">
                      {new Date(e.createdAt).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: one card per audit event instead of a cramped, horizontally-scrolling table */}
          <div className="space-y-3 p-4 md:hidden">
            {(audit.data?.items ?? []).map((e) => (
              <div key={e.id} className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.actor.name}</p>
                    <Badge variant="outline" className="mt-0.5 text-[10px]">
                      {e.actor.type === "super_admin" ? "super admin" : "user"}
                    </Badge>
                  </div>
                  <span className="shrink-0 text-xs text-muted-fg">
                    {new Date(e.createdAt).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </div>
                <code className="mt-2 inline-block rounded bg-surface-2 px-1.5 py-0.5 text-xs">{e.action}</code>
                {e.targetType && (
                  <p className="mt-1.5 text-xs text-muted-fg">
                    {e.targetType}
                    {e.targetId && <span className="font-mono"> · {e.targetId}</span>}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Pagination: kept outside the scroll area so it's always reachable without scrolling right */}
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-xs text-muted-fg">
              Page {page + 1} of {pageCount} · {total} events
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