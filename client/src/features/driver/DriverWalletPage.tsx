import { Plus, Receipt, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import { TxnRow } from "@/features/customer/WalletPage";

interface Balance {
  available: number;
  escrow: number;
}
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

/**
 * Same /wallet/balance + /wallet/transactions endpoints the customer wallet
 * uses — the wallet ledger isn't role-specific. Note: ride fares are cash
 * collected in person and currently aren't auto-credited here on trip
 * completion (see EarningsPage for the real trip-earning figures), so a
 * fresh driver account will show रू 0.00 until a top-up or payout lands.
 */
export function DriverWalletPage() {
  const balance = useResource<Balance>(() => api.get(endpoints.wallet.balance));
  const txns = useResource<Txn[]>(() => api.get(endpoints.wallet.transactions));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet"
        subtitle="Balance and payout history."
        actions={
          <Button variant="accent">
            <Plus className="size-4" /> Top up
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="bg-brand-900 p-6 text-white dark:bg-surface">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Wallet className="size-4" /> Available balance
          </div>
          <p className="mt-3 font-display text-4xl font-bold">
            {balance.state === "success" && balance.data
              ? new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR" }).format(
                  balance.data.available,
                )
              : "रू —"}
          </p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-fg">In escrow</p>
          <p className="mt-3 font-display text-2xl font-bold">
            {balance.state === "success" && balance.data
              ? new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR" }).format(
                  balance.data.escrow,
                )
              : "रू —"}
          </p>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">Transactions</h2>
        <Card className="p-2">
          <AsyncBoundary
            state={txns.state}
            onRetry={txns.refetch}
            label="Your transactions"
            empty={
              <EmptyState
                icon={<Receipt className="size-6 text-muted-fg" />}
                title="No transactions yet"
                description="Top-ups and payouts will show up here as they happen."
              />
            }
          >
            <ul className="divide-y divide-border">
              {(txns.data ?? []).map((t) => (
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
          </AsyncBoundary>
        </Card>
      </div>
    </div>
  );
}