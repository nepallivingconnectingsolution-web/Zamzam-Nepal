import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import type { Onboarding } from "../useOnboarding";
import { errorMessage, useStepDraft } from "../useOnboarding";
import { FileUploader } from "../FileUploader";
import { canChangeDoc, isEditable } from "../docs";
import { LICENCE_EXPIRED_MESSAGE, todayIso, validateLicence, type FieldErrors, type LicenceForm } from "../validation";
import { Field, StepShell } from "./ui";

type Props = Pick<Onboarding, "view" | "saveProfile" | "upload" | "removeUpload"> & { onBack: () => void; onNext: () => void };

const CLASSES = [
  { value: "A", label: "A", hint: "Motorcycle" },
  { value: "K", label: "K", hint: "Scooter" },
  { value: "B", label: "B", hint: "Car, jeep, van" },
  { value: "C", label: "C", hint: "Tempo, three-wheeler" },
  { value: "OTHER", label: "Other" },
];

/** Step 3: the driving licence. An expired licence cannot be submitted. */
export function LicenceStep({ view, saveProfile, upload, removeUpload, onBack, onNext }: Props) {
  const p = view?.profile;
  const initial = useMemo<LicenceForm>(
    () => ({
      licenceNumber: p?.licenceNumber ?? "",
      licenceClass: p?.licenceClass ?? "",
      licenceAuthority: p?.licenceAuthority ?? "",
      licenceIssueDate: p?.licenceIssueDate ?? "",
      licenceExpiryDate: p?.licenceExpiryDate ?? "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p?.userId],
  );
  const [v, setV, clearDraft] = useStepDraft<LicenceForm>("licence", initial);
  const [errors, setErrors] = useState<FieldErrors<keyof LicenceForm | "images">>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const status = view?.application.status;
  const editable = isEditable(status);
  const front = view?.requirements.find((r) => r.docType === "licence_front");
  const back = view?.requirements.find((r) => r.docType === "licence_back");

  // The expiry problem is shown the moment a date is picked, not on submit.
  const liveExpiry = v.licenceExpiryDate ? validateLicence(v).licenceExpiryDate : undefined;
  const expired = liveExpiry === LICENCE_EXPIRED_MESSAGE;

  function set<K extends keyof LicenceForm>(k: K, val: string) {
    setV((old) => ({ ...old, [k]: val }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }

  async function save() {
    const problems: FieldErrors<keyof LicenceForm | "images"> = validateLicence(v);
    if (!front?.current || !back?.current) problems.images = "Upload both the front and the back of your licence.";
    setErrors(problems);
    if (Object.values(problems).some(Boolean)) return;

    setSaving(true);
    setFormError(null);
    try {
      await saveProfile({ ...v, currentStep: 4 });
      clearDraft();
      onNext();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepShell
      title="Driving licence"
      intro="Enter your licence exactly as printed, and upload clear photos of both sides."
      onBack={onBack}
      onNext={() => void save()}
      nextDisabled={expired}
      saving={saving}
      error={formError}
    >
      {expired && (
        <div className="flex items-start gap-3 rounded-xl border border-error/40 bg-error/5 p-3" role="alert">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-error" />
          <p className="text-sm font-medium text-error">{LICENCE_EXPIRED_MESSAGE}</p>
        </div>
      )}

      <Field label="Licence number" required error={errors.licenceNumber} htmlFor="licenceNumber">
        <Input id="licenceNumber" value={v.licenceNumber} error={!!errors.licenceNumber} onChange={(e) => set("licenceNumber", e.target.value)} disabled={!editable} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Licence category" required error={errors.licenceClass}>
          <SelectField value={v.licenceClass} onChange={(x) => set("licenceClass", x)} options={CLASSES} placeholder="Choose category" />
        </Field>
        <Field label="Issuing authority" required error={errors.licenceAuthority} htmlFor="licenceAuthority">
          <Input id="licenceAuthority" placeholder="e.g. DoTM Kathmandu" value={v.licenceAuthority} error={!!errors.licenceAuthority} onChange={(e) => set("licenceAuthority", e.target.value)} disabled={!editable} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Issue date" required error={errors.licenceIssueDate} htmlFor="issue">
          <Input id="issue" type="date" max={todayIso()} value={v.licenceIssueDate} error={!!errors.licenceIssueDate} onChange={(e) => set("licenceIssueDate", e.target.value)} disabled={!editable} />
        </Field>
        <Field label="Expiry date" required error={errors.licenceExpiryDate ?? (expired ? undefined : liveExpiry)} htmlFor="expiry">
          <Input id="expiry" type="date" value={v.licenceExpiryDate} error={!!(errors.licenceExpiryDate || liveExpiry)} onChange={(e) => set("licenceExpiryDate", e.target.value)} disabled={!editable} />
        </Field>
      </div>

      <div className="space-y-3">
        {[front, back].map((r) =>
          r ? (
            <FileUploader
              key={r.docType}
              label={r.label.charAt(0).toUpperCase() + r.label.slice(1)}
              required={r.isRequired}
              imagesOnly={false}
              hint="A photo or scan. Make sure every detail is readable."
              current={r.current}
              canChange={canChangeDoc(status, r.current)}
              canDelete={status === "DRAFT"}
              onUpload={async (file, _e, onProgress) => {
                await upload(r.docType, file, undefined, onProgress);
                setErrors((e) => ({ ...e, images: undefined }));
              }}
              onDelete={r.current ? async () => void (await removeUpload(r.current!.id)) : undefined}
            />
          ) : null,
        )}
        {errors.images && <p className="text-xs font-medium text-error" role="alert">{errors.images}</p>}
      </div>
    </StepShell>
  );
}
