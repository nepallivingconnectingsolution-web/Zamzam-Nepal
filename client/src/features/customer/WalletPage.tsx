import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Plus, Receipt, Wallet, X } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { npr } from "@/lib/utils";
import { toast } from "@/stores/toast.store";

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

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];
const METHODS = [
  { id: "esewa", label: "eSewa" },
  { id: "khalti", label: "Khalti" },
  { id: "card", label: "Card" },
] as const;
type Method = (typeof METHODS)[number]["id"];

export function WalletPage() {
  const balance = useResource<Balance>(() => api.get(endpoints.wallet.balance));
  const txns = useResource<Txn[]>(() => api.get(endpoints.wallet.transactions));
  const [topUpOpen, setTopUpOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet"
        subtitle="Your Zamzam Pay balance, escrow holds and history."
        actions={
          <Button variant="accent" onClick={() => setTopUpOpen(true)}>
            <Plus className="size-4" /> Add money
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-brand-900 p-6 text-white dark:bg-surface sm:col-span-2">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Wallet className="size-4" /> Available balance
          </div>
          <p className="mt-3 font-display text-4xl font-bold">
            {balance.state === "success" && balance.data ? npr(balance.data.available) : "रू —"}
          </p>
          <div className="mt-6 flex gap-3">
            <Button variant="accent" size="sm" onClick={() => setTopUpOpen(true)}>
              Top up
            </Button>
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-fg">In escrow</p>
          <p className="mt-3 font-display text-2xl font-bold">
            {balance.state === "success" && balance.data ? npr(balance.data.escrow) : "रू —"}
          </p>
          <p className="mt-2 text-xs text-muted-fg">
            Funds held safely until your active trips complete.
          </p>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">Recent transactions</h2>
          <div className="flex items-center gap-3">
            <Badge variant="outline">eSewa · Khalti · Bank</Badge>
            <Link to="/app/transactions" className="text-sm font-medium text-accent hover:underline">
              View all
            </Link>
          </div>
        </div>
        <Card className="p-2">
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
            <ul className="divide-y divide-border">
              {(txns.data ?? []).slice(0, 8).map((t) => (
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

      {topUpOpen && (
        <TopUpDialog
          onClose={() => setTopUpOpen(false)}
          onSuccess={() => {
            setTopUpOpen(false);
            balance.refetch();
            txns.refetch();
          }}
        />
      )}
    </div>
  );
}

/**
 * Top-up modal — posts to /wallet/topup, which credits the balance and
 * writes the TOPUP ledger entry atomically on the server. Runs in sandbox
 * mode (instant success) until live eSewa/Khalti gateway keys are wired in.
 */
function TopUpDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState<string>("1000");
  const [method, setMethod] = useState<Method>("esewa");
  const [submitting, setSubmitting] = useState(false);

  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed >= 10 && parsed <= 100000;

  async function submit() {
    if (!valid) {
      toast.error("Enter an amount between NPR 10 and NPR 100,000.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(endpoints.wallet.topup, { amount: Math.round(parsed * 100) / 100, method });
      toast.success(`${npr(parsed)} added to your wallet.`);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Top-up failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add money to wallet"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <Card className="w-full max-w-sm space-y-5 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Add money</h2>
            <p className="text-xs text-muted-fg">Top up your Zamzam Pay balance.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1 text-muted-fg transition-colors hover:bg-surface-2 hover:text-fg"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label htmlFor="topup-amount" className="text-sm font-medium">
            Amount (NPR)
          </label>
          <Input
            id="topup-amount"
            type="number"
            min={10}
            max={100000}
            step="1"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 1000"
          />
          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(String(a))}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  amount === String(a)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-fg hover:border-accent/50"
                }`}
              >
                {npr(a, { compact: true })}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Pay with</p>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  method === m.id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-fg hover:border-accent/50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-fg">
            Sandbox mode — payment gateways go live once merchant keys are configured.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="accent" className="flex-1" onClick={submit} disabled={submitting || !valid}>
            {submitting ? "Adding…" : `Add ${valid ? npr(parsed, { compact: true }) : "money"}`}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Presentational transaction row — one line per wallet ledger entry. */
export function TxnRow({
  inbound,
  label,
  amount,
  date,
  status,
}: {
  inbound: boolean;
  label: string;
  amount?: number;
  date?: string;
  status?: string;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-lg ${
          inbound ? "bg-success/10 text-success" : "bg-surface-2 text-muted-fg"
        }`}
      >
        {inbound ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        {date && (
          <p className="text-xs text-muted-fg">
            {new Date(date).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        )}
      </div>
      {amount != null && (
        <span className={`shrink-0 text-sm font-semibold ${inbound ? "text-success" : "text-fg"}`}>
          {inbound ? "+" : "−"}
          {npr(amount)}
        </span>
      )}
      {status && status !== "SUCCESS" && (
        <Badge variant={status === "FAILED" ? "danger" : "warning"} className="shrink-0">
          {status.toLowerCase()}
        </Badge>
      )}
    </li>
  );
}