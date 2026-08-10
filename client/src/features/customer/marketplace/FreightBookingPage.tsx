import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Gavel,
  Package,
  Plus,
  Star,
  Truck,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { DateField } from "@/components/ui/date-field";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import { cn, npr } from "@/lib/utils";
import { StarRating } from "@/features/hotels/StarRating";

const CATEGORY_OPTIONS = [
  { value: "", label: "Any suitable vehicle" },
  { value: "van", label: "Van" },
  { value: "mini_truck", label: "Mini truck" },
  { value: "truck", label: "Truck" },
];

const STATUS_BADGE: Record<string, { variant: "warning" | "success" | "accent" | "danger" | "default"; label: string }> = {
  OPEN: { variant: "warning", label: "Open for bids" },
  ASSIGNED: { variant: "accent", label: "Transporter assigned" },
  IN_TRANSIT: { variant: "accent", label: "In transit" },
  DELIVERED: { variant: "success", label: "Delivered" },
  CANCELLED: { variant: "default", label: "Cancelled" },
};

interface Load {
  id: string;
  from: string;
  to: string;
  cargoDescription: string;
  weightKg: number;
  budget: number | null;
  pickupDate: string | null;
  status: keyof typeof STATUS_BADGE;
  bidCount: number;
  acceptedAmount: number | null;
}

interface Bid {
  id: string;
  amount: number;
  message: string | null;
  status: string;
  transporterName: string;
  transporterMobile: string;
  vehicleMakeModel: string | null;
  vehiclePlate: string | null;
}

interface LoadReview {
  id: string;
  loadId: string;
  transporterId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export function FreightBookingPage() {
  const loads = useResource<Load[]>(() => api.get(endpoints.loads.mine), [], { refreshInterval: 10_000 });

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openBidsFor, setOpenBidsFor] = useState<string | null>(null);

  const [fromLabel, setFromLabel] = useState("");
  const [toLabel, setToLabel] = useState("");
  const [cargo, setCargo] = useState("");
  const [weight, setWeight] = useState("");
  const [category, setCategory] = useState("");
  const [budget, setBudget] = useState("");
  const [pickupDate, setPickupDate] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (fromLabel.trim().length < 2 || toLabel.trim().length < 2 || cargo.trim().length < 3 || !weight) {
      toast.error("Fill in pickup, drop-off, cargo and weight.");
      return;
    }
    setSaving(true);
    try {
      await api.post(endpoints.loads.create, {
        fromLabel: fromLabel.trim(),
        toLabel: toLabel.trim(),
        cargoDescription: cargo.trim(),
        weightKg: Number(weight),
        ...(category ? { preferredCategory: category } : {}),
        ...(budget ? { budget: Number(budget) } : {}),
        ...(pickupDate ? { pickupDate } : {}),
      });
      toast.success("Load posted", "Transporters can now bid on it.");
      setShowForm(false);
      setFromLabel(""); setToLabel(""); setCargo(""); setWeight(""); setCategory(""); setBudget(""); setPickupDate("");
      loads.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't post the load. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelLoad(id: string) {
    if (!window.confirm("Cancel this load? Pending bids will be dismissed.")) return;
    setBusyId(id);
    try {
      await api.patch(endpoints.loads.cancel(id));
      toast.success("Load cancelled");
      loads.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't cancel this load.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Freight"
        subtitle="Post a load and let verified transporters bid — you pick the best offer."
        actions={
          <Button variant="accent" onClick={() => setShowForm((v) => !v)}>
            <Plus className="size-4" /> {showForm ? "Close" : "Post a load"}
          </Button>
        }
      />

      {showForm && (
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-fg">Pickup location</label>
                <Input placeholder="e.g. Balaju Industrial Area" value={fromLabel} onChange={(e) => setFromLabel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-fg">Drop-off location</label>
                <Input placeholder="e.g. Birgunj" value={toLabel} onChange={(e) => setToLabel(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-muted-fg">Cargo description</label>
                <Input placeholder="e.g. 40 sacks of cement" value={cargo} onChange={(e) => setCargo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-fg">Weight (kg)</label>
                <Input type="number" min={1} placeholder="e.g. 2000" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-muted-fg">Preferred vehicle</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map((c) => (
                    <Chip key={c.value} selected={category === c.value} onClick={() => setCategory(c.value)}>
                      {c.label}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-fg">Budget, NPR (optional)</label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Your target price"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="font-tabular"
                />
              </div>
              <DateField label="Pickup date (optional)" value={pickupDate} onChange={setPickupDate} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="accent" disabled={saving}>
                {saving ? "Posting…" : "Post load"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <AsyncBoundary
        state={loads.state}
        onRetry={loads.refetch}
        label="Your loads"
        empty={
          <EmptyState
            icon={<Package className="size-6 text-muted-fg" />}
            title="No loads posted yet"
            description="Post your first load above and verified transporters will start bidding."
          />
        }
      >
        <div className="space-y-3">
          {(loads.data ?? []).map((load) => {
            const badge = STATUS_BADGE[load.status];
            return (
              <Card key={load.id} className="p-4">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                    <Truck className="size-5 text-muted-fg" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{load.cargoDescription}</p>
                    <p className="text-xs text-muted-fg">
                      {load.from} → {load.to} · {load.weightKg} kg
                      {load.budget != null ? ` · budget ${npr(load.budget)}` : ""}
                      {load.pickupDate ? ` · pickup ${load.pickupDate}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {load.acceptedAmount != null && (
                      <span className="text-xs text-muted-fg">
                        Awarded <span className="font-tabular">{npr(load.acceptedAmount)}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  {load.status === "OPEN" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOpenBidsFor(openBidsFor === load.id ? null : load.id)}
                      >
                        <Gavel className="size-4" /> {load.bidCount} bid{load.bidCount === 1 ? "" : "s"}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyId === load.id} onClick={() => cancelLoad(load.id)}>
                        <XCircle className="size-4" /> Cancel
                      </Button>
                    </>
                  )}
                  {load.status !== "OPEN" && load.bidCount > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setOpenBidsFor(openBidsFor === load.id ? null : load.id)}>
                      View bids
                    </Button>
                  )}
                </div>

                {openBidsFor === load.id && <BidList loadId={load.id} loadStatus={load.status} onChanged={() => loads.refetch()} />}

                {load.status === "DELIVERED" && (
                  <div className="mt-3 border-t border-border pt-3">
                    <LoadReviewPanel loadId={load.id} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function BidList({ loadId, loadStatus, onChanged }: { loadId: string; loadStatus: string; onChanged: () => void }) {
  const [data, setData] = useState<{ bids: Bid[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ bids: Bid[] }>(endpoints.loads.bids(loadId));
      setData(res);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadId]);

  async function accept(bidId: string) {
    setBusy(bidId);
    try {
      await api.post(endpoints.loads.acceptBid(loadId, bidId));
      toast.success("Bid accepted", "The transporter has been notified. Other bids were declined.");
      onChanged();
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't accept this bid.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="mt-3 text-xs text-muted-fg">Loading bids…</p>;
  const bids = data?.bids ?? [];
  if (bids.length === 0) return <p className="mt-3 text-xs text-muted-fg">No bids yet.</p>;

  return (
    <div className="mt-3 space-y-2">
      {bids.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              <span className="font-tabular">{npr(b.amount)}</span>
              <span className="ml-2 text-xs font-normal text-muted-fg">{b.transporterName}</span>
            </p>
            <p className="text-xs text-muted-fg">
              {b.vehicleMakeModel ? `${b.vehicleMakeModel} · ` : ""}
              {b.transporterMobile}
              {b.message ? ` · "${b.message}"` : ""}
            </p>
          </div>
          <div className="shrink-0">
            {b.status === "ACCEPTED" ? (
              <Badge variant="success"><CheckCircle2 className="size-3" /> Accepted</Badge>
            ) : b.status === "PENDING" && loadStatus === "OPEN" ? (
              <Button size="sm" variant="accent" disabled={busy === b.id} onClick={() => accept(b.id)}>
                Accept
              </Button>
            ) : (
              <Badge variant="default" className="capitalize">{b.status.toLowerCase()}</Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Show the existing review, or the form to leave one — mirrors the food/hotel/ride review flow. */
function LoadReviewPanel({ loadId }: { loadId: string }) {
  const review = useResource<LoadReview | null>(() => api.get(endpoints.loads.review(loadId)), [loadId]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.post(endpoints.loads.review(loadId), { rating, comment: comment || undefined });
      toast.success("Review submitted", "Thanks for the feedback!");
      review.refetch();
    } catch (e) {
      toast.error((e instanceof ApiError && (e.detail as { message?: string })?.message) || "Couldn't submit the review.");
    } finally {
      setSubmitting(false);
    }
  }

  if (review.state === "loading" || review.state === "idle") return null;

  if (review.data) {
    return (
      <div className="rounded-xl border border-border bg-surface-2/60 p-4">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-fg">
          <Star className="size-3.5" /> Your review
        </p>
        <StarRating value={review.data.rating} size={15} />
        {review.data.comment && <p className="mt-1.5 text-sm">{review.data.comment}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-fg">Rate this shipment</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} type="button" onClick={() => setRating(s)}>
            <Star className={cn("size-5", s <= rating ? "fill-warning text-warning" : "text-muted-fg")} />
          </button>
        ))}
      </div>
      <Input className="mt-3" placeholder="How was the delivery? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button variant="accent" size="sm" className="mt-3" disabled={submitting} onClick={submit}>
        {submitting ? "Submitting…" : "Submit review"}
      </Button>
    </div>
  );
}