import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import { npr } from "@/lib/utils";
import { TxnRow } from "@/features/customer/WalletPage";

interface Txn {
  id: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  description: string;
  createdAt: string;
  inbound: boolean;
}

type Filter = "all" | "in" | "out";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in", label: "Money in" },
  { id: "out", label: "Money out" },
];

/**
 * Full payment history — same ledger the Wallet page previews, shown in
 * full with direction filters and lifetime in/out totals.
 */
export function TransactionsPage() {
  const txns = useResource<Txn[]>(() => api.get(endpoints.wallet.transactions));
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const all = txns.data ?? [];
    if (filter === "in") return all.filter((t) => t.inbound);
    if (filter === "out") return all.filter((t) => !t.inbound);
    return all;
  }, [txns.data, filter]);

  const totals = useMemo(() => {
    const all = (txns.data ?? []).filter((t) => t.status === "SUCCESS");
    return {
      in: all.filter((t) => t.inbound).reduce((s, t) => s + t.amount, 0),
      out: all.filter((t) => !t.inbound).reduce((s, t) => s + t.amount, 0),
    };
  }, [txns.data]);

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" subtitle="Your full payment history across Zamzam." />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm text-muted-fg">Total in</p>
          <p className="mt-2 font-display text-2xl font-bold text-success">{npr(totals.in)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-fg">Total out</p>
          <p className="mt-2 font-display text-2xl font-bold">{npr(totals.out)}</p>
        </Card>
      </div>

      <Card className="p-2">
        <div className="flex gap-2 border-b border-border px-3 py-3">
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
          state={txns.state}
          onRetry={txns.refetch}
          label="Your transactions"
          empty={
            <EmptyState
              icon={<Receipt className="size-6 text-muted-fg" />}
              title="No transactions yet"
              description="Top-ups, bookings and refunds will show up here as they happen."
            />
          }
        >
          {rows.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={<Receipt className="size-6 text-muted-fg" />}
                title="Nothing in this filter"
                description="Try a different filter to see more of your history."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((t) => (
                <TxnRow
                  key={t.id}
                  inbound={t.inbound}
                  label={t.description}
                  amount={t.amount}
                  date={t.createdAt}
                  status={t.status}
                />
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </Card>
    </div>
  );
}