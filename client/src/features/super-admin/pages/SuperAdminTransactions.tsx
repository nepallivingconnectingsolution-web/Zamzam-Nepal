import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Receipt, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { npr } from "@/lib/utils";

interface TxnRow {
  id: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  description: string;
  inbound: boolean;
  user: { name: string; mobile: string | null } | null;
  createdAt: string;
}

interface TxnsResponse {
  items: TxnRow[];
  total: number;
}

const PAGE_SIZE = 50;
const TYPES = ["all", "TOPUP", "RIDE", "BUS", "HOTEL", "FOOD", "GROCERY", "PARCEL", "FREIGHT", "REFUND", "PAYOUT", "ADJUSTMENT"] as const;

/**
 * Platform-wide transaction ledger — every wallet movement across every
 * user, with search, type filter and pagination (GET /super-admin/transactions).
 */
export function SuperAdminTransactions() {
  const { saApi } = useSuperAdminApi();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [page, setPage] = useState(0);

  // Any change to search/type must snap back to page 1, otherwise the
  // offset can point past the end of the new, smaller result set.
  useEffect(() => setPage(0), [search, type]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));
    if (search) params.set("q", search);
    if (type !== "all") params.set("type", type);
    return params.toString();
  }, [search, type, page]);

  async function resolve(id: string, outcome: "SUCCESS" | "FAILED") {
  await saApi(`/super-admin/transactions/${id}/resolve`, { method: "POST", body: { outcome } });
  txns.refetch();
}

  const txns = useResource<TxnsResponse>(() => saApi(`/super-admin/transactions?${query}`), [query]);

  const total = txns.data?.total ?? 0;
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" subtitle="Full platform transaction history." />

      <Card>
        <div className="space-y-3 border-b border-border px-5 py-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />
            <Input
              placeholder="Search description, name, mobile…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  type === t
                    ? "border-teal-700 bg-teal-100 text-teal-700 dark:border-accent dark:bg-white/10 dark:text-accent"
                    : "border-border text-muted-fg hover:border-accent/50"
                }`}
              >
                {t === "all" ? "All" : t.toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <AsyncBoundary
          state={txns.state}
          onRetry={txns.refetch}
          label="Transactions"
          empty={
            <div className="px-5 py-10">
              <EmptyState
                icon={<Receipt className="size-6 text-muted-fg" />}
                title="No transactions found"
                description="Try a different search or filter."
              />
            </div>
          }
        >
          {/* Desktop / tablet: full table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm font-tabular">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-xs font-semibold text-muted-fg">
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(txns.data?.items ?? []).map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-surface-2/50">
                    <td className="px-5 py-3">
                      {t.user ? (
                        <>
                          <p className="font-medium">{t.user.name}</p>
                          {t.user.mobile && <p className="text-xs text-muted-fg">{t.user.mobile}</p>}
                        </>
                      ) : (
                        <span className="text-xs text-muted-fg">—</span>
                      )}
                    </td>
                    <td className="max-w-xs px-5 py-3">
                      <p className="truncate" title={t.description}>{t.description}</p>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="outline" className="text-[10px]">{t.type.toLowerCase()}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 font-semibold ${t.inbound ? "text-success" : ""}`}>
                        {t.inbound ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                        {npr(t.amount)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant={t.status === "SUCCESS" ? "success" : t.status === "FAILED" ? "danger" : "warning"}
                        className="text-[10px]"
                      >
                        {t.status.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-fg">
                      {new Date(t.createdAt).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-5 py-3">
                    {(t.type === "REFUND" || t.type === "TOPUP") && t.status === "PENDING" && (
                       <div className="flex gap-1.5">
                         <Button size="sm" variant="outline" onClick={() => resolve(t.id, "SUCCESS")}>
                           {t.type === "REFUND" ? "Mark refunded" : "Confirm top-up"}
                         </Button>
                       <Button size="sm" variant="outline" onClick={() => resolve(t.id, "FAILED")}>Mark failed</Button>
                     </div>
                     )}
                     </td>
                  </tr>
                    ))}
             </tbody>
            </table>
          </div>

          {/* Mobile: one card per transaction instead of a cramped, horizontally-scrolling table */}
          <div className="space-y-3 p-4 font-tabular md:hidden">
            {(txns.data?.items ?? []).map((t) => (
              <div key={t.id} className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {t.user ? (
                      <>
                        <p className="truncate font-medium">{t.user.name}</p>
                        {t.user.mobile && <p className="text-xs text-muted-fg">{t.user.mobile}</p>}
                      </>
                    ) : (
                      <span className="text-xs text-muted-fg">—</span>
                    )}
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 font-semibold ${t.inbound ? "text-success" : ""}`}>
                    {t.inbound ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                    {npr(t.amount)}
                  </span>
                </div>
                <p className="mt-1.5 truncate text-xs text-muted-fg" title={t.description}>{t.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{t.type.toLowerCase()}</Badge>
                  <Badge
                    variant={t.status === "SUCCESS" ? "success" : t.status === "FAILED" ? "danger" : "warning"}
                    className="text-[10px]"
                  >
                    {t.status.toLowerCase()}
                  </Badge>
                  <span className="text-xs text-muted-fg">
                    {new Date(t.createdAt).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                                   {(t.type === "REFUND" || t.type === "TOPUP") && t.status === "PENDING" && (
                   <div className="mt-2 flex gap-1.5">
                     <Button size="sm" variant="outline" onClick={() => resolve(t.id, "SUCCESS")}>
                       {t.type === "REFUND" ? "Mark refunded" : "Confirm top-up"}
                     </Button>
                     <Button size="sm" variant="outline" onClick={() => resolve(t.id, "FAILED")}>Mark failed</Button>
                   </div>
                )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination: kept outside the scroll area so it's always reachable without scrolling right */}
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-xs text-muted-fg">
              Page {page + 1} of {pageCount} · {total} transactions
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