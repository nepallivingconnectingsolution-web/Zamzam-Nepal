import { useMemo, useState } from "react";
import { Bike, Car } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectField } from "@/components/ui/select-field";
import { ApiError } from "@/api/client";
import type { Onboarding } from "../useOnboarding";
import { errorMessage, useStepDraft } from "../useOnboarding";
import { isEditable } from "../docs";
import { formatPlate, validateVehicle, type FieldErrors, type VehicleForm } from "../validation";
import { Field, StepShell } from "./ui";

type Props = Pick<Onboarding, "view" | "saveVehicle"> & { onBack: () => void; onNext: () => void };

const FUEL = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "electric", label: "Electric" },
  { value: "hybrid", label: "Hybrid" },
];
const BODY = [
  { value: "hatchback", label: "Hatchback" },
  { value: "sedan", label: "Sedan" },
  { value: "suv", label: "SUV" },
  { value: "other", label: "Other" },
];
const SEATS = ["4", "5", "6", "7"].map((n) => ({ value: n, label: `${n} seats` }));

/** Step 4: the vehicle. The fields below the type change with Bike / Car. */
export function VehicleStep({ view, saveVehicle, onBack, onNext }: Props) {
  const veh = view?.vehicle;
  const initial = useMemo<VehicleForm>(
    () => ({
      category: veh?.category ?? "",
      make: veh?.make ?? "",
      model: veh?.model ?? "",
      plateNumber: veh?.plateNumber ?? "",
      manufactureYear: veh?.manufactureYear ? String(veh.manufactureYear) : "",
      registrationYear: veh?.registrationYear ? String(veh.registrationYear) : "",
      color: veh?.color ?? "",
      fuelType: veh?.fuelType ?? "",
      serviceClass: veh?.serviceClass ?? "",
      seats: veh ? String(veh.seats) : "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [veh?.id],
  );
  const [v, setV, clearDraft] = useStepDraft<VehicleForm>("vehicle", initial);
  const [errors, setErrors] = useState<FieldErrors<keyof VehicleForm>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const editable = isEditable(view?.application.status);
  const isCar = v.category === "car";

  function set<K extends keyof VehicleForm>(k: K, val: string) {
    setV((old) => ({ ...old, [k]: val }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }

  async function save() {
    const problems = validateVehicle(v);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setSaving(true);
    setFormError(null);
    try {
      await saveVehicle({
        category: v.category,
        make: v.make.trim(),
        model: v.model.trim(),
        plateNumber: v.plateNumber.trim(),
        manufactureYear: Number(v.manufactureYear),
        registrationYear: v.registrationYear ? Number(v.registrationYear) : undefined,
        color: v.color.trim(),
        fuelType: v.fuelType || undefined,
        serviceClass: isCar ? v.serviceClass : undefined,
        seats: isCar && v.seats ? Number(v.seats) : undefined,
      });
      clearDraft();
      onNext();
    } catch (err) {
      // A plate someone else already has is a field problem, not a form-wide one.
      if (err instanceof ApiError && err.status === 409) setErrors({ plateNumber: err.message });
      else setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepShell
      title="Your vehicle"
      intro="Tell us what you'll drive. You can add documents and photos next."
      onBack={onBack}
      onNext={() => void save()}
      saving={saving}
      error={formError}
    >
      <Field label="Vehicle type" required error={errors.category}>
        <SegmentedControl
          options={[{ value: "bike", label: "Bike" }, { value: "car", label: "Car" }]}
          value={(v.category || "") as "bike"}
          onChange={(c) => editable && set("category", c)}
        />
        <div className="flex items-center gap-2 pt-1 text-xs text-muted-fg" aria-hidden>
          {v.category === "car" ? <Car className="size-4" /> : <Bike className="size-4" />}
          {v.category === "car" ? "Taxi rides and parcels" : v.category === "bike" ? "Bike rides and parcels" : "Choose what you'll drive"}
        </div>
      </Field>

      <Field label="Number plate" required error={errors.plateNumber} htmlFor="plate" hint="For example BA 99 PA 1234">
        <Input
          id="plate"
          autoCapitalize="characters"
          autoComplete="off"
          className="font-mono uppercase tracking-wide"
          value={v.plateNumber}
          error={!!errors.plateNumber}
          onChange={(e) => set("plateNumber", formatPlate(e.target.value))}
          disabled={!editable}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Make" required error={errors.make} htmlFor="make">
          <Input id="make" placeholder={isCar ? "e.g. Suzuki" : "e.g. Bajaj"} value={v.make} error={!!errors.make} onChange={(e) => set("make", e.target.value)} disabled={!editable} />
        </Field>
        <Field label="Model" required error={errors.model} htmlFor="model">
          <Input id="model" placeholder={isCar ? "e.g. Alto" : "e.g. Pulsar 150"} value={v.model} error={!!errors.model} onChange={(e) => set("model", e.target.value)} disabled={!editable} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Manufacturing year" required error={errors.manufactureYear} htmlFor="myear">
          <Input id="myear" inputMode="numeric" maxLength={4} value={v.manufactureYear} error={!!errors.manufactureYear} onChange={(e) => set("manufactureYear", e.target.value.replace(/\D/g, ""))} disabled={!editable} />
        </Field>
        <Field label="Registration year" error={errors.registrationYear} htmlFor="ryear" hint="Optional">
          <Input id="ryear" inputMode="numeric" maxLength={4} value={v.registrationYear} error={!!errors.registrationYear} onChange={(e) => set("registrationYear", e.target.value.replace(/\D/g, ""))} disabled={!editable} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Colour" required error={errors.color} htmlFor="color">
          <Input id="color" value={v.color} error={!!errors.color} onChange={(e) => set("color", e.target.value)} disabled={!editable} />
        </Field>
        <Field label="Fuel type" hint="Optional">
          <SelectField value={v.fuelType} onChange={(x) => set("fuelType", x)} options={FUEL} placeholder="Choose fuel" />
        </Field>
      </div>

      {isCar && (
        <div className="grid gap-4 rounded-xl bg-surface-2 p-4 sm:grid-cols-2">
          <Field label="Body type" required error={errors.serviceClass}>
            <SelectField value={v.serviceClass} onChange={(x) => set("serviceClass", x)} options={BODY} placeholder="Choose body type" />
          </Field>
          <Field label="Passenger seats" hint="Not counting you">
            <SelectField value={v.seats} onChange={(x) => set("seats", x)} options={SEATS} placeholder="Choose seats" />
          </Field>
        </div>
      )}
    </StepShell>
  );
}
