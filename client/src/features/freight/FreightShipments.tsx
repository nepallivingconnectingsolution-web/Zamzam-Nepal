import { useState } from "react";
import { PackageCheck, Truck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import { npr } from "@/lib/utils";

const STATUS_BADGE: Record<string, { variant: "accent" | "success" | "default"; label: string }> = {
  ASSIGNED: { variant: "accent", label: "Awarded — arrange pickup" },
  IN_TRANSIT: { variant: "accent", label: "In transit" },
  DELIVERED: { variant: "success", label: "Delivered" },
};

interface Shipment {
  id: string;
  from: string;
  to: string;
  cargoDescription: string;
  weightKg: number;
  status: keyof typeof STATUS_BADGE;
  wonAmount: number;
  customerName: string;
  customerMobile: string;
}

export function FreightShipments() {
  const shipments = useResource<Shipment[]>(() => api.get(endpoints.freight.shipments), [], { refreshInterval: 15_000 });
  const [busy, setBusy] = useState<string | null>(null);

  async function advance(id: string, to: "IN_TRANSIT" | "DELIVERED") {
    setBusy(id);
    try {
      await api.patch(to === "IN_TRANSIT" ? endpoints.freight.startShipment(id) : endpoints.freight.deliverShipment(id));
      toast.success(to === "IN_TRANSIT" ? "Marked in transit" : "Marked delivered", "The shipper can see the update.");
      shipments.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the shipment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Shipments" subtitle="Loads you've won — update their status as you carry them." />

      <AsyncBoundary
        state={shipments.state}
        onRetry={shipments.refetch}
        label="Shipments"
        empty={
          <EmptyState
            icon={<Truck className="size-6 text-muted-fg" />}
            title="No shipments yet"
            description="When a shipper accepts one of your bids, that load appears here to manage."
          />
        }
      >
        <div className="space-y-3">
          {(shipments.data ?? []).map((s) => {
            const badge = STATUS_BADGE[s.status];
            return (
              <Card key={s.id} className="p-4">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                    <PackageCheck className="size-5 text-muted-fg" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.cargoDescription}</p>
                    <p className="text-xs text-muted-fg">
                      {s.from} → {s.to} · {s.weightKg} kg · {s.customerName} ({s.customerMobile})
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <span className="text-xs text-muted-fg">{npr(s.wonAmount)}</span>
                  </div>
                </div>

                {s.status !== "DELIVERED" && (
                  <div className="mt-3 flex justify-end border-t border-border pt-3">
                    {s.status === "ASSIGNED" ? (
                      <Button size="sm" variant="accent" disabled={busy === s.id} onClick={() => advance(s.id, "IN_TRANSIT")}>
                        Start transit
                      </Button>
                    ) : (
                      <Button size="sm" variant="accent" disabled={busy === s.id} onClick={() => advance(s.id, "DELIVERED")}>
                        Mark delivered
                      </Button>
                    )}
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