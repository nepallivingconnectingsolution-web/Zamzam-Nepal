import { Landmark, Lock, PiggyBank, RefreshCcw, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { npr } from "@/lib/utils";

interface WalletOverview {
  totalAvailable: number;
  totalEscrow: number;
  walletCount: number;
  topups24h: number;
  refunds24h: number;
  topWallets: {
    userId: string;
    available: number;
    escrow: number;
    user: { name: string; mobile: string | null; role: string | null } | null;
    updatedAt: string;
  }[];
}

/**
 * Platform float — the money the platform is holding on behalf of users.
 * totalAvailable + totalEscrow is the liability Zamzam owes its users,
 * which is the number finance reconciles against the settlement account.
 */
export function SuperAdminWallet() {
  const { saApi } = useSuperAdminApi();
  const overview = useResource<WalletOverview>(() => saApi("/super-admin/wallet"));
  const d = overview.data;

  const stats = [
    { label: "Total available", value: d ? npr(d.totalAvailable) : "—", icon: Landmark, hint: "Spendable balance across all wallets" },
    { label: "In escrow", value: d ? npr(d.totalEscrow) : "—", icon: Lock, hint: "Held for trips and bookings in flight" },
    { label: "Top-ups (24h)", value: d ? npr(d.topups24h) : "—", icon: PiggyBank, hint: "Money added in the last 24 hours" },
    { label: "Refunds (24h)", value: d ? npr(d.refunds24h) : "—", icon: RefreshCcw, hint: "Money returned in the last 24 hours" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet & Ledger"
        subtitle={`Platform balances across ${d?.walletCount ?? "…"} wallets.`}
        actions={
          <Link to="/x-admin/transactions" className="text-sm font-medium text-accent hover:underline">
            View full ledger →
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-5">
              <div className="flex items-center gap-2 text-sm text-muted-fg">
                <Icon className="size-4" /> {s.label}
              </div>
              <p className="mt-3 font-display text-2xl font-bold">{s.value}</p>
              <p className="mt-1 text-xs text-muted-fg">{s.hint}</p>
            </Card>
          );
        })}
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">Largest wallets</h2>
        <Card>
          <AsyncBoundary
            state={overview.state}
            onRetry={overview.refetch}
            label="Ledger"
            empty={
              <div className="px-5 py-10">
                <EmptyState
                  icon={<WalletCards className="size-6 text-muted-fg" />}
                  title="No wallets yet"
                  description="Wallets appear as users top up or receive refunds."
                />
              </div>
            }
          >
            {/* Desktop / tablet: full table */}
<div className="hidden overflow-x-auto md:block">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-border bg-surface-2 text-left text-xs font-semibold text-muted-fg">
        <th className="px-5 py-3">User</th>
        <th className="px-5 py-3">Role</th>
        <th className="px-5 py-3">Available</th>
        <th className="px-5 py-3">Escrow</th>
        <th className="px-5 py-3">Last activity</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-border">
      {(d?.topWallets ?? []).map((w) => (
        <tr key={w.userId} className="transition-colors hover:bg-surface-2/50">
          <td className="px-5 py-3">
            {w.user ? (
              <>
                <p className="font-medium">{w.user.name}</p>
                {w.user.mobile && <p className="text-xs text-muted-fg">{w.user.mobile}</p>}
              </>
            ) : (
              <span className="text-xs text-muted-fg">—</span>
            )}
          </td>
          <td className="px-5 py-3">
            <Badge variant="outline" className="text-[10px]">{w.user?.role ?? "—"}</Badge>
          </td>
          <td className="px-5 py-3 font-semibold">{npr(w.available)}</td>
          <td className="px-5 py-3 text-muted-fg">{npr(w.escrow)}</td>
          <td className="px-5 py-3 text-xs text-muted-fg">
            {new Date(w.updatedAt).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

{/* Mobile: one card per wallet instead of a cramped, horizontally-scrolling table */}
<div className="space-y-3 p-4 md:hidden">
  {(d?.topWallets ?? []).map((w) => (
    <div key={w.userId} className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {w.user ? (
            <>
              <p className="truncate font-medium">{w.user.name}</p>
              {w.user.mobile && <p className="text-xs text-muted-fg">{w.user.mobile}</p>}
            </>
          ) : (
            <span className="text-xs text-muted-fg">—</span>
          )}
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">{w.user?.role ?? "—"}</Badge>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <dt className="text-muted-fg">Available</dt>
          <dd className="font-semibold text-fg">{npr(w.available)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-fg">Escrow</dt>
          <dd className="font-medium text-fg">{npr(w.escrow)}</dd>
        </div>
        <div className="col-span-2 flex items-center justify-between">
          <dt className="text-muted-fg">Last activity</dt>
          <dd className="font-medium text-fg">
            {new Date(w.updatedAt).toLocaleString("en-NP", { dateStyle: "medium", timeStyle: "short" })}
          </dd>
          </div>
          </dl>
          </div>
          ))}
          </div>
          </AsyncBoundary>
        </Card>
      </div>
    </div>
  );
}