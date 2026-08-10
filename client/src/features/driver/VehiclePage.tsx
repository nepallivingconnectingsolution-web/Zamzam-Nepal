import { useState } from "react";
import { Car, CheckCircle2, ChevronDown, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { AsyncBoundary, EmptyState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { api, ApiError, endpoints } from "@/api/client";
import { toast } from "@/stores/toast.store";
import { cn } from "@/lib/utils";

interface Vehicle {
  id: string;
  category: "bike" | "car" | "van" | "mini_truck" | "truck";
  services: string[];
  makeModel: string;
  plateNumber: string;
  color: string | null;
  maxWeightKg: number;
  seats: number;
  verificationStatus: "PENDING" | "APPROVED" | "SUSPENDED";
  isCurrentVehicle: boolean;
}

const CATEGORY_OPTIONS: { value: Vehicle["category"]; label: string; hint: string }[] = [
  { value: "bike", label: "Bike", hint: "Bike rides · small parcels" },
  { value: "car", label: "Car", hint: "Taxi · parcels" },
  { value: "van", label: "Van", hint: "Parcels · freight" },
  { value: "mini_truck", label: "Mini truck", hint: "Parcels · freight" },
  { value: "truck", label: "Truck", hint: "Freight" },
];

const STATUS_BADGE: Record<Vehicle["verificationStatus"], { variant: "warning" | "success" | "danger"; label: string }> = {
  PENDING: { variant: "warning", label: "Pending review" },
  APPROVED: { variant: "success", label: "Verified" },
  SUSPENDED: { variant: "danger", label: "Suspended" },
};

export function VehiclePage() {
  const vehicles = useResource<Vehicle[]>(() => api.get(endpoints.vehicles.mine));

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [category, setCategory] = useState<Vehicle["category"]>("car");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const selectedCategory = CATEGORY_OPTIONS.find((c) => c.value === category)!;
  const [makeModel, setMakeModel] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [color, setColor] = useState("");
  const [maxWeightKg, setMaxWeightKg] = useState("");
  const [seats, setSeats] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (makeModel.trim().length < 2 || plateNumber.trim().length < 4) {
      toast.error("Enter the vehicle make/model and a valid plate number.");
      return;
    }
    setSaving(true);
    try {
      await api.post(endpoints.vehicles.register, {
        category,
        makeModel: makeModel.trim(),
        plateNumber: plateNumber.trim(),
        ...(color.trim() ? { color: color.trim() } : {}),
        ...(maxWeightKg ? { maxWeightKg: Number(maxWeightKg) } : {}),
        ...(seats ? { seats: Number(seats) } : {}),
      });
      toast.success("Vehicle registered", "It's now pending admin verification.");
      setShowForm(false);
      setMakeModel(""); setPlateNumber(""); setColor(""); setMaxWeightKg(""); setSeats("");
      vehicles.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't register the vehicle. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function activate(id: string) {
    setBusyId(id);
    try {
      await api.post(endpoints.vehicles.activate(id));
      toast.success("Active vehicle updated", "This vehicle will be offered to nearby customers while you're online.");
      vehicles.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't activate this vehicle.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this vehicle from your garage?")) return;
    setBusyId(id);
    try {
      await api.delete(endpoints.vehicles.remove(id));
      toast.success("Vehicle removed");
      vehicles.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove this vehicle.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vehicle"
        subtitle="Register your vehicles, track verification and choose which one you drive."
        actions={
          <Button variant="accent" onClick={() => setShowForm((v) => !v)}>
            <Plus className="size-4" /> {showForm ? "Close form" : "Add vehicle"}
          </Button>
        }
      />

      {showForm && (
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-fg">Vehicle type</label>
                <button
                  type="button"
                  onClick={() => setCategoryPickerOpen(true)}
                  className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-surface px-3 text-left text-sm text-fg transition-colors active:bg-surface-2"
                >
                  <span>
                    {selectedCategory.label}{" "}
                    <span className="text-xs text-muted-fg">— {selectedCategory.hint}</span>
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-fg" />
                </button>
                <BottomSheet open={categoryPickerOpen} onClose={() => setCategoryPickerOpen(false)} title="Vehicle type">
                  <div className="space-y-1 pb-2">
                    {CATEGORY_OPTIONS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => {
                          setCategory(c.value);
                          setCategoryPickerOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition-colors active:bg-surface-2"
                      >
                        <span>
                          <span className="font-medium">{c.label}</span>{" "}
                          <span className="text-xs text-muted-fg">{c.hint}</span>
                        </span>
                        {c.value === category && <CheckCircle2 className="size-4 shrink-0 text-accent" />}
                      </button>
                    ))}
                  </div>
                </BottomSheet>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-fg">Make & model</label>
                <Input placeholder="e.g. Suzuki WagonR" value={makeModel} onChange={(e) => setMakeModel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-fg">Plate number</label>
                <Input placeholder="e.g. BA 2 PA 1234" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-fg">Color (optional)</label>
                <Input placeholder="e.g. White" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-fg">Max load, kg (optional)</label>
                <Input type="number" min={1} placeholder="Defaults by vehicle type" value={maxWeightKg} onChange={(e) => setMaxWeightKg(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-fg">Passenger seats (optional)</label>
                <Input type="number" min={1} placeholder="e.g. 4" value={seats} onChange={(e) => setSeats(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-fg">
                New vehicles start as <span className="font-medium">Pending review</span> — an admin verifies them the same way partner KYC works.
              </p>
              <Button type="submit" variant="accent" disabled={saving}>
                {saving ? "Saving…" : "Register vehicle"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <AsyncBoundary
        state={vehicles.state}
        onRetry={vehicles.refetch}
        label="Your vehicles"
        empty={
          <EmptyState
            icon={<Car className="size-6 text-muted-fg" />}
            title="No vehicles yet"
            description="Add your first vehicle above. Once an admin verifies it, activate it and go online."
          />
        }
      >
        <div className="space-y-3">
          {(vehicles.data ?? []).map((v) => {
            const badge = STATUS_BADGE[v.verificationStatus];
            return (
              <Card key={v.id} className={cn("flex flex-wrap items-center gap-4 p-4", v.isCurrentVehicle && "ring-1 ring-accent")}>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                  <Car className="size-5 text-muted-fg" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {v.makeModel}
                    <span className="ml-2 text-xs font-normal uppercase tracking-wide text-muted-fg">{v.plateNumber}</span>
                  </p>
                  <p className="text-xs capitalize text-muted-fg">
                    {v.category.replace("_", " ")} · up to {v.maxWeightKg} kg · serves {v.services.join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {v.isCurrentVehicle ? (
                    <Badge variant="accent"><CheckCircle2 className="size-3" /> Active</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === v.id || v.verificationStatus !== "APPROVED"}
                      title={v.verificationStatus !== "APPROVED" ? "Available once an admin verifies this vehicle" : undefined}
                      onClick={() => activate(v.id)}
                    >
                      Set active
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={busyId === v.id} onClick={() => remove(v.id)} aria-label="Remove vehicle">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {v.verificationStatus === "SUSPENDED" && (
                  <p className="flex w-full items-center gap-1.5 text-xs text-danger">
                    <ShieldAlert className="size-3.5" /> This vehicle was suspended by an admin and can't be used until re-approved.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </AsyncBoundary>
    </div>
  );
}