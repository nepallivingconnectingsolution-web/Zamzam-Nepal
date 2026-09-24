import { useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil } from "lucide-react";
import { ApiError } from "@/api/client";
import type { Onboarding } from "../useOnboarding";
import { errorMessage } from "../useOnboarding";
import type { Blocker } from "../onboarding.types";
import { requiredCount, requiredDone } from "../docs";
import { StepShell } from "./ui";

type Props = Pick<Onboarding, "view" | "submit"> & {
  onBack: () => void;
  /** Jump to a step to fix something. */
  onEdit: (step: number) => void;
  onSubmitted: () => void;
};

/** Which wizard step fixes each kind of problem the server reports. */
export function stepForBlocker(code: string, message = ""): number {
  if (code === "PHONE_NOT_VERIFIED") return 0;
  if (code === "PROFILE_INCOMPLETE") return 1;
  // Licence details, or a missing / rejected / expired licence photo.
  if (code.startsWith("LICENCE") || /licen[cs]e/i.test(message)) return 2;
  if (code === "NO_VEHICLE" || code === "VEHICLE_INCOMPLETE") return 3;
  return 4;
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-fg">{label}</dt>
      <dd className="text-right font-medium">{value || "-"}</dd>
    </div>
  );
}

function Section({ title, step, onEdit, children }: { title: string; step: number; onEdit: (s: number) => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-display text-h2 font-bold">{title}</h3>
        <button type="button" onClick={() => onEdit(step)} className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline dark:text-accent" aria-label={`Edit ${title}`}>
          <Pencil className="size-3.5" /> Edit
        </button>
      </div>
      <dl className="divide-y divide-border">{children}</dl>
    </section>
  );
}

/** Step 6: check everything, confirm it's genuine, and send it for verification. */
export function ReviewStep({ view, submit, onBack, onEdit, onSubmitted }: Props) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverBlockers, setServerBlockers] = useState<Blocker[] | null>(null);

  const p = view?.profile;
  const v = view?.vehicle;
  const blockers = serverBlockers ?? view?.blockers ?? [];
  const reqs = view?.requirements ?? [];
  const canSend = agreed && blockers.length === 0;

  async function send() {
    setSaving(true);
    setError(null);
    try {
      await submit();
      onSubmitted();
    } catch (err) {
      // The server re-checks everything and says exactly what is still wrong.
      const details = err instanceof ApiError ? (err.detail as { details?: Blocker[] } | undefined)?.details : undefined;
      if (details?.length) setServerBlockers(details);
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepShell
      title="Review and submit"
      intro="Check everything below. After you submit, our team verifies your documents, usually within a day or two."
      onBack={onBack}
      onNext={() => void send()}
      nextLabel="Submit for verification"
      nextDisabled={!canSend}
      saving={saving}
      error={error}
    >
      {blockers.length > 0 ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4" role="alert">
          <p className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4 text-warning" /> A few things still need your attention</p>
          <ul className="mt-2 space-y-1.5">
            {blockers.map((b, i) => (
              <li key={`${b.code}-${i}`} className="flex items-start justify-between gap-3 text-sm">
                <span>{b.message}</span>
                <button type="button" onClick={() => onEdit(stepForBlocker(b.code, b.message))} className="shrink-0 text-xs font-semibold text-teal-700 hover:underline dark:text-accent">Fix</button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-xl bg-success/10 p-3 text-sm font-medium text-success">
          <CheckCircle2 className="size-5" /> Everything is filled in. You're ready to submit.
        </p>
      )}

      <Section title="Personal" step={1} onEdit={onEdit}>
        <Row label="Name" value={p?.legalName} />
        <Row label="Date of birth" value={p?.dateOfBirth} />
        <Row label="Address" value={[p?.address, p?.city, p?.province].filter(Boolean).join(", ")} />
        <Row label="Emergency contact" value={p?.emergencyContactName ? `${p.emergencyContactName} (${p.emergencyContactPhone ?? ""})` : null} />
      </Section>

      <Section title="Driving licence" step={2} onEdit={onEdit}>
        <Row label="Number" value={p?.licenceNumber} />
        <Row label="Category" value={p?.licenceClass} />
        <Row label="Issued by" value={p?.licenceAuthority} />
        <Row label="Valid until" value={p?.licenceExpiryDate} />
      </Section>

      <Section title="Vehicle" step={3} onEdit={onEdit}>
        <Row label="Type" value={v ? (v.category === "car" ? "Car" : "Bike") : null} />
        <Row label="Vehicle" value={v ? [v.make, v.model, v.manufactureYear].filter(Boolean).join(" ") : null} />
        <Row label="Number plate" value={v?.plateNumber} />
        <Row label="Colour" value={v?.color} />
      </Section>

      <Section title="Documents and photos" step={4} onEdit={onEdit}>
        <Row label="Required items uploaded" value={`${requiredDone(reqs)} of ${requiredCount(reqs)}`} />
      </Section>

      <label className="flex items-start gap-3 rounded-xl bg-surface-2 p-4 text-sm">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-teal-700" />
        <span>I confirm that the information and documents I've provided are genuine and belong to me.</span>
      </label>
    </StepShell>
  );
}
