import { useNavigate } from "react-router-dom";
import { BellRing, Power } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { npr } from "@/lib/utils";
import { useDriverPortal } from "./driver-portal.context";

export function RideRequestsPage() {
  const navigate = useNavigate();
  const { online, toggling, toggleOnline, requests, job, actionBusy, acceptRequest } = useDriverPortal();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ride requests"
        subtitle="Incoming trips matched to you, within 10 km of your live position."
        actions={
          !job.data ? (
            <Button variant={online ? "danger" : "accent"} onClick={toggleOnline} disabled={toggling}>
              <Power className="size-4" />
              {online ? "Go offline" : "Go online"}
            </Button>
          ) : undefined
        }
      />

      {job.data ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-accent/40 bg-accent/5 p-4">
          <div>
            <p className="text-sm font-semibold">You already have an active trip</p>
            <p className="text-xs text-muted-fg">
              Finish or cancel it before new requests can reach you again.
            </p>
          </div>
          <Button size="sm" variant="accent" onClick={() => navigate("/driver/trip")}>
            Go to current trip
          </Button>
        </Card>
      ) : (
        <AsyncBoundary
          state={online ? requests.state : "empty"}
          onRetry={requests.refetch}
          label="Ride requests"
          empty={
            <EmptyState
              icon={<BellRing className="size-6 text-muted-fg" />}
              title={online ? "Waiting for requests" : "Go online to receive requests"}
              description={
                online
                  ? "Nearby ride requests will appear here in real time — this list refreshes every few seconds."
                  : "Flip the switch above to start matching with riders."
              }
              action={
                !online ? (
                  <Button variant="accent" onClick={toggleOnline} disabled={toggling}>
                    <Power className="size-4" /> Go online
                  </Button>
                ) : undefined
              }
            />
          }
        >
          <div className="space-y-3">
            {(requests.data ?? []).map((r) => (
              <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium capitalize">
                    {r.service} · {r.from} → {r.to}
                  </p>
                  <p className="text-xs text-muted-fg">
                    {r.pickupKm != null ? `Pickup ${r.pickupKm} km away · ~${r.etaMin} min` : "Pickup distance unavailable"}
                    {r.parcelWeightKg != null ? ` · ${r.parcelWeightKg} kg parcel` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="success">{npr(r.fare)}</Badge>
                  <Button size="sm" variant="accent" disabled={actionBusy === r.id} onClick={() => acceptRequest(r.id)}>
                    Accept
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </AsyncBoundary>
      )}
    </div>
  );
}