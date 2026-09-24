import { useState } from "react";
import type { Onboarding } from "../useOnboarding";
import { errorMessage } from "../useOnboarding";
import { FileUploader } from "../FileUploader";
import { canChangeDoc, requiredCount, requiredDone } from "../docs";
import type { Requirement } from "../onboarding.types";
import { StepShell } from "./ui";

type Props = Pick<Onboarding, "view" | "upload" | "removeUpload"> & { onBack: () => void; onNext: () => void };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Step 5: everything except the licence (that has its own step), built from the
 * server's requirement list, so a bike asks for bike items and a car for car
 * items, and an admin's configuration changes show up here with no release.
 */
export function DocumentsStep({ view, upload, removeUpload, onBack, onNext }: Props) {
  const [error, setError] = useState<string | null>(null);
  const status = view?.application.status;
  const reqs = (view?.requirements ?? []).filter((r) => !r.docType.startsWith("licence_"));

  const identity = reqs.filter((r) => r.subject === "DRIVER");
  const vehicleDocs = reqs.filter((r) => r.subject === "VEHICLE" && r.kind === "DOCUMENT");
  const photos = reqs.filter((r) => r.subject === "VEHICLE" && r.kind === "PHOTO");

  const total = requiredCount(reqs);
  const done = requiredDone(reqs);
  const complete = done === total;

  function slot(r: Requirement) {
    return (
      <FileUploader
        key={r.docType}
        label={cap(r.label)}
        required={r.isRequired}
        requiresExpiry={r.requiresExpiry}
        imagesOnly={r.kind === "PHOTO"}
        hint={r.kind === "PHOTO" ? "Clear and well lit, the whole vehicle in frame." : "A clear photo or scan. Every detail must be readable."}
        current={r.current}
        canChange={canChangeDoc(status, r.current)}
        canDelete={status === "DRAFT"}
        onUpload={async (file, expiry, onProgress) => void (await upload(r.docType, file, expiry, onProgress))}
        onDelete={r.current ? async () => void (await removeUpload(r.current!.id)) : undefined}
      />
    );
  }

  function next() {
    if (!complete) {
      setError(`Upload the ${total - done} required ${total - done === 1 ? "item" : "items"} still missing.`);
      return;
    }
    setError(null);
    onNext();
  }

  return (
    <StepShell
      title="Documents and photos"
      intro="Every item marked * is required. Reviewers check each one, so make sure they are clear and current."
      onBack={onBack}
      onNext={next}
      error={error}
      footerNote={
        <p className="text-sm text-muted-fg" aria-live="polite">
          <span className="font-semibold text-fg">{done} of {total}</span> required items uploaded
        </p>
      }
    >
      {identity.length > 0 && (
        <section className="space-y-3" aria-label="Identity">
          <h3 className="font-display text-h2 font-bold">Identity</h3>
          {identity.map(slot)}
        </section>
      )}
      {vehicleDocs.length > 0 && (
        <section className="space-y-3" aria-label="Vehicle documents">
          <h3 className="font-display text-h2 font-bold">Vehicle documents</h3>
          {vehicleDocs.map(slot)}
        </section>
      )}
      {photos.length > 0 && (
        <section className="space-y-3" aria-label="Vehicle photos">
          <h3 className="font-display text-h2 font-bold">Vehicle photos</h3>
          <div className="grid gap-3 sm:grid-cols-2">{photos.map(slot)}</div>
        </section>
      )}
      {reqs.length === 0 && (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted-fg">
          Add your vehicle first. Then we'll show exactly which documents it needs.
        </p>
      )}
      {error && !reqs.length && <p className="text-sm text-error">{errorMessage(error)}</p>}
    </StepShell>
  );
}
