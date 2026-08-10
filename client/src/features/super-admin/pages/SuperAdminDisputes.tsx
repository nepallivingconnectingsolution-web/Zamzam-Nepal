import { useMemo, useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi, SuperAdminApiError } from "@/features/super-admin/useSuperAdminApi";
import { toast } from "@/stores/toast.store";

interface DisputeRow {
  id: string;
  subject: string;
  status: "OPEN" | "RESOLVED";
  amount: string;
  raisedBy: { name: string; mobile: string | null } | null;
  createdAt: string;
}

type Filter = "OPEN" | "RESOLVED" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "OPEN", label: "Open" },
  { id: "RESOLVED", label: "Resolved" },
  { id: "all", label: "All" },
];

/**
 * Super-admin dispute queue — every customer support ticket and dispute
 * lands here. Resolving writes an audit-log entry with the acting admin.
 */
export function SuperAdminDisputes() {
  const { saApi } = useSuperAdminApi();
  const disputes = useResource<DisputeRow[]>(() => saApi("/super-admin/disputes"));
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = disputes.data ?? [];
    return filter === "all" ? all : all.filter((d) => d.status === filter);
  }, [disputes.data, filter]);

  async function resolve(id: string) {
    if (!window.confirm("Mark this dispute as resolved? This is recorded in the audit log.")) return;
    setResolvingId(id);
    try {
      await saApi(`/super-admin/disputes/${id}/resolve`, { method: "PATCH" });
      toast.success("Dispute resolved.");
      disputes.refetch();
    } catch (err) {
      toast.error(err instanceof SuperAdminApiError ? err.message : "Couldn't resolve this dispute.");
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Disputes" subtitle="Open cases and support tickets needing super-admin resolution." />

      <Card>
        <div className="flex flex-wrap gap-2 border-b border-border px-5 py-4">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.id
                  ? "border-teal-700 bg-teal-100 text-teal-700 dark:border-accent dark:bg-white/10 dark:text-accent"
                  : "border-border text-muted-fg hover:border-accent/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <AsyncBoundary
          state={disputes.state}
          onRetry={disputes.refetch}
          label="Disputes"
          empty={
            <div className="px-5 py-10">
              <EmptyState
                icon={<ShieldAlert className="size-6 text-muted-fg" />}
                title="No disputes"
                description="Customer tickets and disputes will appear here as they're filed."
              />
            </div>
          }
        >
          {rows.length === 0 ? (
            <div className="px-5 py-10">
              <EmptyState
                icon={<CheckCircle2 className="size-6 text-muted-fg" />}
                title={filter === "OPEN" ? "No open disputes" : "Nothing here"}
                description="Try a different filter."
              />
            </div>
          ) : (
           <>
  {/* Desktop / tablet: full table */}
  <div className="hidden overflow-x-auto md:block">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border bg-surface-2 text-left text-xs font-semibold text-muted-fg">
          <th className="px-5 py-3">Subject</th>
          <th className="px-5 py-3">Raised by</th>
          <th className="px-5 py-3">Status</th>
          <th className="px-5 py-3">Filed</th>
          <th className="px-5 py-3">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((d) => (
          <tr key={d.id} className="transition-colors hover:bg-surface-2/50">
            <td className="max-w-md px-5 py-3"><p className="truncate font-medium" title={d.subject}>{d.subject}</p></td>
            <td className="px-5 py-3">
              {d.raisedBy ? (
                <>
                  <p className="font-medium">{d.raisedBy.name}</p>
                  {d.raisedBy.mobile && <p className="text-xs text-muted-fg">{d.raisedBy.mobile}</p>}
                </>
              ) : (
                <span className="text-xs text-muted-fg">—</span>
              )}
            </td>
            <td className="px-5 py-3">
              <Badge variant={d.status === "RESOLVED" ? "success" : "warning"} className="text-[10px]">{d.status}</Badge>
            </td>
            <td className="px-5 py-3 text-xs text-muted-fg">
              {new Date(d.createdAt).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}
            </td>
            <td className="px-5 py-3">
              {d.status === "OPEN" ? (
                <Button variant="ghost" size="sm" className="text-xs" disabled={resolvingId === d.id} onClick={() => resolve(d.id)}>
                  {resolvingId === d.id ? "Resolving…" : "Resolve"}
                </Button>
              ) : (
                <span className="text-xs text-muted-fg">Closed</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    {disputes.data && (
      <p className="border-t border-border px-5 py-3 text-xs text-muted-fg">
        Showing {rows.length} of {disputes.data.length} disputes
      </p>
    )}
  </div>

  {/* Mobile: one card per dispute instead of a cramped, horizontally-scrolling table */}
  <div className="space-y-3 p-4 md:hidden">
    {rows.map((d) => (
      <div key={d.id} className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate font-medium" title={d.subject}>{d.subject}</p>
          <Badge variant={d.status === "RESOLVED" ? "success" : "warning"} className="shrink-0 text-[10px]">{d.status}</Badge>
        </div>
        <div className="mt-1.5">
          {d.raisedBy ? (
            <p className="text-xs text-muted-fg">{d.raisedBy.name}{d.raisedBy.mobile && <> · {d.raisedBy.mobile}</>}</p>
          ) : (
            <p className="text-xs text-muted-fg">—</p>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-fg">
            {new Date(d.createdAt).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}
          </span>
          {d.status === "OPEN" ? (
            <Button variant="ghost" size="sm" className="text-xs" disabled={resolvingId === d.id} onClick={() => resolve(d.id)}>
              {resolvingId === d.id ? "Resolving…" : "Resolve"}
            </Button>
          ) : (
            <span className="text-xs text-muted-fg">Closed</span>
          )}
        </div>
      </div>
    ))}
    {disputes.data && (
      <p className="pt-1 text-xs text-muted-fg">Showing {rows.length} of {disputes.data.length} disputes</p>
    )}
  </div>
</> 
          )}
        </AsyncBoundary>
      </Card>
    </div>
  );
}