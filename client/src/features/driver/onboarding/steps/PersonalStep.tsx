import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectField } from "@/components/ui/select-field";
import type { Onboarding } from "../useOnboarding";
import { errorMessage, useStepDraft } from "../useOnboarding";
import { FileUploader } from "../FileUploader";
import { NEPAL_PROVINCES, validatePersonal, type FieldErrors, type PersonalForm } from "../validation";
import { Field, StepShell } from "./ui";

type Props = Pick<Onboarding, "view" | "saveProfile" | "upload"> & { onBack: () => void; onNext: () => void };

const PROVINCES = NEPAL_PROVINCES.map((p) => ({ value: p, label: p }));

/** Step 2: who the driver is, a clear photo of them, and someone to call in an emergency. */
export function PersonalStep({ view, saveProfile, upload, onBack, onNext }: Props) {
  const p = view?.profile;
  const initial = useMemo<PersonalForm>(
    () => ({
      legalName: p?.legalName ?? "",
      dateOfBirth: p?.dateOfBirth ?? "",
      gender: p?.gender ?? "",
      address: p?.address ?? "",
      city: p?.city ?? "",
      province: p?.province ?? "",
      emergencyContactName: p?.emergencyContactName ?? "",
      emergencyContactPhone: p?.emergencyContactPhone ?? "",
      language: p?.language ?? "ne",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p?.userId],
  );
  const [v, setV, clearDraft] = useStepDraft<PersonalForm>("personal", initial);
  const [errors, setErrors] = useState<FieldErrors<keyof PersonalForm | "photo">>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof PersonalForm>(k: K, val: string) => {
    setV((old) => ({ ...old, [k]: val }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const editable = view?.application.status === "DRAFT" || view?.application.status === "RESUBMISSION_REQUIRED" || view?.application.status === "EXPIRED";

  async function save() {
    const problems: FieldErrors<keyof PersonalForm | "photo"> = validatePersonal(v);
    if (!p?.photoFileId) problems.photo = "Add a clear photo of your face.";
    setErrors(problems);
    if (Object.values(problems).some(Boolean)) return;

    setSaving(true);
    setFormError(null);
    try {
      await saveProfile({ ...v, gender: v.gender || undefined, currentStep: 3 });
      clearDraft();
      onNext();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const photo = p?.photoFileId
    ? { id: "profile_photo", status: "PENDING" as const, rejectionReason: null, expiryDate: null, fileId: p.photoFileId, originalName: "Profile photo", mimeType: "image/jpeg", uploadedAt: "" }
    : null;

  return (
    <StepShell
      title="About you"
      intro="Use your name exactly as it appears on your citizenship or licence."
      onBack={onBack}
      onNext={() => void save()}
      saving={saving}
      error={formError}
    >
      <div>
        <FileUploader
          label="Profile photo"
          required
          plain
          imagesOnly
          minSize={200}
          hint="A clear, front-facing photo. Riders see it when you arrive."
          current={photo}
          canChange={editable}
          onUpload={async (file, _e, onProgress) => {
            await upload("profile_photo", file, undefined, onProgress);
            setErrors((e) => ({ ...e, photo: undefined }));
          }}
        />
        {errors.photo && <p className="mt-1.5 text-xs font-medium text-error" role="alert">{errors.photo}</p>}
      </div>

      <Field label="Full legal name" required error={errors.legalName} htmlFor="legalName">
        <Input id="legalName" autoComplete="name" value={v.legalName} error={!!errors.legalName} onChange={(e) => set("legalName", e.target.value)} disabled={!editable} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date of birth" required error={errors.dateOfBirth} htmlFor="dob">
          <Input id="dob" type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} value={v.dateOfBirth} error={!!errors.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} disabled={!editable} />
        </Field>
        <Field label="Gender" hint="Optional">
          <SegmentedControl
            options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }]}
            value={(v.gender || "") as "male"}
            onChange={(g) => set("gender", g)}
          />
        </Field>
      </div>

      <Field label="Address" required error={errors.address} htmlFor="address">
        <Input id="address" autoComplete="street-address" value={v.address} error={!!errors.address} onChange={(e) => set("address", e.target.value)} disabled={!editable} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" required error={errors.city} htmlFor="city">
          <Input id="city" autoComplete="address-level2" value={v.city} error={!!errors.city} onChange={(e) => set("city", e.target.value)} disabled={!editable} />
        </Field>
        <Field label="Province" required error={errors.province}>
          <SelectField value={v.province} onChange={(x) => set("province", x)} options={PROVINCES} placeholder="Choose province" />
        </Field>
      </div>

      <div className="space-y-3 rounded-xl bg-surface-2 p-4">
        <p className="text-sm font-semibold">Emergency contact</p>
        <Field label="Contact name" required error={errors.emergencyContactName} htmlFor="ecn">
          <Input id="ecn" value={v.emergencyContactName} error={!!errors.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} disabled={!editable} />
        </Field>
        <Field label="Contact phone" required error={errors.emergencyContactPhone} htmlFor="ecp">
          <Input id="ecp" inputMode="tel" autoComplete="tel" value={v.emergencyContactPhone} error={!!errors.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value.replace(/[^\d]/g, ""))} disabled={!editable} />
        </Field>
      </div>

      <Field label="Preferred language">
        <SegmentedControl
          options={[{ value: "ne", label: "नेपाली" }, { value: "en", label: "English" }]}
          value={(v.language || "ne") as "ne"}
          onChange={(l) => set("language", l)}
        />
      </Field>
    </StepShell>
  );
}
