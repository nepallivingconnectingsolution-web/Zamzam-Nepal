import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, ClipboardCheck, FileText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { cn } from "@/lib/utils";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import {
  ROLE_LABEL,
  STAGE_LABEL,
  STAGE_TONE,
  type ApprovalBucket,
  type ApprovalItem,
  type ApprovalList,
  type ApprovalRole,
} from "@/features/super-admin/approvals.types";

const TABS: { value: ApprovalBucket; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

const TYPES: { value: ApprovalRole | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "driver", label: "Drivers" },
  { value: "hotel", label: "Hotels" },
  { value: "restaurant", label: "Restaurants" },
  { value: "grocery", label: "Grocery" },
  { value: "bus_operator", label: "Bus" },
  { value: "freight", label: "Freight" },
];

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function docSummary(item: ApprovalItem): string {
  const d = item.documents;
  if (d.uploaded === 0) return "No documents yet";
  const parts = [`${d.uploaded} uploaded`];
  if (d.pending > 0) parts.push(`${d.pending} to review`);
  if (d.rejected > 0) parts.push(`${d.rejected} rejected`);
  return parts.join(" · ");
}

/**
 * The one place a super admin decides on new drivers and businesses. Every row
 * opens the same review page, where documents are checked and the decision is
 * made, so nothing needs a second panel.
 */
export function SuperAdminApprovals() {
  const { saApi } = useSuperAdminApi();
  const [tab, setTab] = useState<ApprovalBucket>("PENDING");
  // ?type=driver comes from the old Drivers / Driver applications links.
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get("type");
  const [type, setType] = useState<ApprovalRole | "">(TYPES.some((t) => t.value === initialType) ? (initialType as ApprovalRole) : "");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");

  // One request per pause in typing, not one per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setTerm(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const list = useResource<ApprovalList>(
    () => {
      const params = new URLSearchParams({ status: tab });
      if (type) params.set("type", type);
      if (term) params.set("q", term);
      return saApi<ApprovalList>(`/super-admin/approvals?${params}`);
    },
    [saApi, tab, type, term],
    { refreshInterval: 30_000 },
  );

  const items = list.data?.items ?? [];
  const counts = list.data?.counts;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Partner approvals</h1>
        <p className="mt-1 text-sm text-muted-fg">
          Review drivers, hotels, restaurants, grocery stores, bus operators and freight partners in one place. Open a
          registration to check their details and documents, then approve or reject.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border" role="tablist" aria-label="Approval status">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-medium",
              tab === t.value ? "border-accent text-accent-600 dark:text-accent" : "border-transparent text-muted-fg hover:text-fg",
            )}
          >
            {t.label}
            {counts && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums">{counts[t.value]}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          {TYPES.map((f) => (
            <button
              key={f.value || "all"}
              type="button"
              aria-pressed={type === f.value}
              onClick={() => setType(f.value)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm",
                type === f.value
                  ? "border-teal-700 bg-teal-100 font-medium text-accent-600 dark:border-accent dark:bg-white/10 dark:text-accent"
                  : "border-border text-muted-fg hover:bg-surface-2",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative lg:ml-auto lg:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />
          <Input
            aria-label="Search registrations"
            placeholder="Search name, business, phone or email"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {list.state === "loading" || list.state === "idle" ? (
        <div className="space-y-3" role="status" aria-label="Loading registrations">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : list.state === "error" ? (
        <ErrorState onRetry={list.refetch} message="We couldn't load the registrations." />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="size-6 text-muted-fg" />}
          title={term || type ? "No registrations match these filters" : `No ${tab.toLowerCase()} registrations`}
          description={
            tab === "PENDING" && !term && !type
              ? "New drivers and businesses appear here as soon as they register and upload their documents."
              : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {items.map((u) => (
            <li key={u.userId}>
              <Link
                to={`/x-admin/approvals/${u.userId}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {u.businessName || u.name}
                    <Badge variant="outline" className="ml-2 align-middle text-[10px]">{ROLE_LABEL[u.role]}</Badge>
                  </p>
                  <p className="truncate text-xs text-muted-fg">
                    {u.businessName ? `${u.name} · ` : ""}
                    {u.mobile ?? "no phone"} · {u.email}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-fg">
                    <FileText className="size-3.5" /> {docSummary(u)} · registered {when(u.submittedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant={STAGE_TONE[u.stage]}>{STAGE_LABEL[u.stage]}</Badge>
                  <ChevronRight className="size-4 text-muted-fg" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
