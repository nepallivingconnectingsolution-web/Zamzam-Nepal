import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Receipt, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Chip } from "@/components/ui/chip";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { npr } from "@/lib/utils";
import { toast } from "@/stores/toast.store";
import { haptics } from "@/lib/native/haptics";

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
      {/* No header action: it opened the same top-up sheet as the button on
          the balance card directly below it. One action, offered twice, in
          the screen's two loudest slots — the card's is better placed
          (it's attached to the number it changes), so this one goes. */}
      <PageHeader
        title="Wallet"
        subtitle="Your Zamzam Pay balance, escrow holds and history."
      />

      <div className="grid gap-4">
        <Card className="bg-brand-900 p-6 text-white dark:bg-surface sm:col-span-2">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Wallet className="size-4" /> Available balance
          </div>
          <p className="mt-3 font-display text-4xl font-bold font-tabular">
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
          <p className="mt-3 font-display text-2xl font-bold font-tabular">
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

      <TopUpSheet
        open={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        onSuccess={() => {
          setTopUpOpen(false);
          balance.refetch();
          txns.refetch();
        }}
      />
    </div>
  );
}

/**
 * Top-up sheet — posts to /wallet/topup, which records a PENDING TOPUP
 * ledger entry. Until live eSewa/Khalti gateway keys are wired in, there's
 * no way to verify payment automatically, so the balance is only credited
 * once a super-admin confirms the transaction — it does not land instantly.
 */
function TopUpSheet({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
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
      const res = await api.post<{ message?: string }>(endpoints.wallet.topup, {
        amount: Math.round(parsed * 100) / 100,
        method,
      });
      toast.success(res?.message ?? `${npr(parsed)} top-up requested — pending confirmation.`);
      void haptics.success();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Top-up failed. Please try again.");
      void haptics.error();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => !submitting && onClose()}
      title="Add money"
      description="Top up your Zamzam Pay balance."
    >
      <div className="space-y-5 pb-2">
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
            className="font-tabular"
          />
          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((a) => (
              <Chip key={a} selected={amount === String(a)} onClick={() => setAmount(String(a))} className="font-tabular">
                {npr(a, { compact: true })}
              </Chip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Pay with</p>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <Chip key={m.id} selected={method === m.id} onClick={() => setMethod(m.id)} className="justify-center">
                {m.label}
              </Chip>
            ))}
          </div>
          <p className="text-[11px] text-muted-fg">
            Sandbox mode — payment gateways go live once merchant keys are configured.
          </p>
        </div>

        <Button variant="accent" size="lg" className="w-full font-tabular" onClick={submit} disabled={submitting || !valid}>
          {submitting ? "Adding…" : `Add ${valid ? npr(parsed, { compact: true }) : "money"}`}
        </Button>
      </div>
    </BottomSheet>
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