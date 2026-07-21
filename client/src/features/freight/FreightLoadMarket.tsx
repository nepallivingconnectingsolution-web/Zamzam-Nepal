import { useState } from "react";
import { Gavel, Package, PackageSearch } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import { npr } from "@/lib/utils";

interface MyBid {
  id: string;
  amount: number;
  message: string | null;
}

interface OpenLoad {
  id: string;
  from: string;
  to: string;
  cargoDescription: string;
  weightKg: number;
  preferredCategory: string | null;
  budget: number | null;
  pickupDate: string | null;
  bidCount: number;
  myBid: MyBid | null;
}

export function FreightLoadMarket() {
  const loads = useResource<OpenLoad[]>(() => api.get(endpoints.freight.openLoads), [], { refreshInterval: 10_000 });
  const [openFor, setOpenFor] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader title="Load marketplace" subtitle="Open freight loads you can bid on. Lowest bids win the work." />

      <AsyncBoundary
        state={loads.state}
        onRetry={loads.refetch}
        label="Open loads"
        empty={
          <EmptyState
            icon={<PackageSearch className="size-6 text-muted-fg" />}
            title="No open loads right now"
            description="When shippers post freight, it'll appear here for you to bid on."
          />
        }
      >
        <div className="space-y-3">
          {(loads.data ?? []).map((load) => (
            <Card key={load.id} className="p-4">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                  <Package className="size-5 text-muted-fg" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{load.cargoDescription}</p>
                  <p className="text-xs text-muted-fg">
                    {load.from} → {load.to} · {load.weightKg} kg
                    {load.preferredCategory ? ` · prefers ${load.preferredCategory.replace("_", " ")}` : ""}
                    {load.budget != null ? ` · budget ${npr(load.budget)}` : ""}
                    {load.pickupDate ? ` · pickup ${load.pickupDate}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-xs text-muted-fg">{load.bidCount} bid{load.bidCount === 1 ? "" : "s"}</span>
                  {load.myBid ? (
                    <Badge variant="accent">Your bid {npr(load.myBid.amount)}</Badge>
                  ) : (
                    <Badge variant="warning">Not bid yet</Badge>
                  )}
                </div>
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <Button size="sm" variant={load.myBid ? "outline" : "accent"} onClick={() => setOpenFor(openFor === load.id ? null : load.id)}>
                  <Gavel className="size-4" /> {load.myBid ? "Update bid" : "Place bid"}
                </Button>
                {openFor === load.id && (
                  <BidForm
                    loadId={load.id}
                    existing={load.myBid}
                    onDone={() => {
                      setOpenFor(null);
                      loads.refetch();
                    }}
                  />
                )}
              </div>
            </Card>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function BidForm({ loadId, existing, onDone }: { loadId: string; existing: MyBid | null; onDone: () => void }) {
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [message, setMessage] = useState(existing?.message ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!amount || Number(amount) < 1) {
      toast.error("Enter a bid amount.");
      return;
    }
    setBusy(true);
    try {
      await api.post(endpoints.freight.placeBid(loadId), {
        amount: Number(amount),
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      toast.success(existing ? "Bid updated" : "Bid placed", "The shipper can now review your offer.");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't place the bid.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!existing) return;
    setBusy(true);
    try {
      await api.patch(endpoints.freight.withdrawBid(existing.id));
      toast.success("Bid withdrawn");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't withdraw the bid.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-fg">Your price (NPR)</label>
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-fg">Message (optional)</label>
          <Input placeholder="e.g. Can pick up today" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="accent" disabled={busy} onClick={submit}>
          {existing ? "Update bid" : "Submit bid"}
        </Button>
        {existing && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={withdraw}>
            Withdraw
          </Button>
        )}
      </div>
    </div>
  );
}