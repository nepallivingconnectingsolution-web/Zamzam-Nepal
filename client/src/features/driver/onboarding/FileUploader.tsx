import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Clock, RefreshCw, Trash2, Upload, XCircle } from "lucide-react";
import { api, endpoints } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SecureFile } from "@/components/shared/secure-file";
import { cn } from "@/lib/utils";
import type { CurrentDoc } from "./onboarding.types";
import { errorMessage } from "./useOnboarding";
import { todayIso, validateFile } from "./validation";

interface Props {
  label: string;
  required?: boolean;
  hint?: string;
  current: CurrentDoc | null;
  /** Photos and the profile picture must be images. */
  imagesOnly?: boolean;
  /** Profile photo: minimum width and height. */
  minSize?: number;
  /** Insurance, road tax...: the document's own expiry date is asked for. */
  requiresExpiry?: boolean;
  /** No review status (the profile photo is checked as part of the whole application). */
  plain?: boolean;
  /** False when the server would refuse a replacement (already submitted and not rejected). */
  canChange: boolean;
  /** Removing an upload is only possible while the application is a draft. */
  canDelete?: boolean;
  onUpload: (file: File, expiryDate: string | undefined, onProgress: (percent: number) => void) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const STATUS: Record<string, { text: string; tone: string; icon: typeof Clock }> = {
  PENDING: { text: "Waiting for review", tone: "text-warning", icon: Clock },
  APPROVED: { text: "Approved", tone: "text-success", icon: CheckCircle2 },
  REJECTED: { text: "Rejected", tone: "text-error", icon: XCircle },
  RESUBMISSION_REQUIRED: { text: "Please upload again", tone: "text-error", icon: XCircle },
  EXPIRED: { text: "Expired", tone: "text-error", icon: XCircle },
};

/**
 * One upload slot: preview, required marker, review status with the reviewer's
 * reason, camera or file picker, progress, retry, replace and remove.
 */
export function FileUploader({
  label, required, hint, current, imagesOnly, minSize, requiresExpiry, plain, canChange, canDelete, onUpload, onDelete,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [expiry, setExpiry] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [deleting, setDeleting] = useState(false);
  const uploading = progress !== null;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const hasCamera = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
  const needsExpiry = !!requiresExpiry;
  const expiryProblem = needsExpiry && (!expiry ? "Enter the expiry date first." : expiry <= todayIso() ? "That date has already passed." : null);

  async function send(file: File) {
    setError(null);
    const problem = await validateFile(file, { imagesOnly, minSize });
    if (problem) return setError(problem);
    setLastFile(file);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    });
    setProgress(0);
    try {
      await onUpload(file, needsExpiry ? expiry : undefined, setProgress);
      setLastFile(null);
      setPreview(null);
      setExpiry("");
    } catch (err) {
      setError(errorMessage(err, "The upload didn't go through."));
    } finally {
      setProgress(null);
    }
  }

  function pick(input: HTMLInputElement | null) {
    if (expiryProblem) return setError(expiryProblem);
    input?.click();
  }

  const status = current && !plain ? STATUS[current.status] : null;
  const StatusIcon = status?.icon;
  const locked = !canChange && !!current;

  return (
    <div className={cn("rounded-xl border p-3", current?.status === "REJECTED" || current?.status === "RESUBMISSION_REQUIRED" || current?.status === "EXPIRED" ? "border-error/40" : "border-border")}>
      <div className="flex items-start gap-3">
        <SecureFile
          fileKey={current?.fileId ?? null}
          load={() => api.blob(endpoints.driverOnboarding.fileBlob(current!.fileId))}
          mimeType={current?.mimeType}
          name={current?.originalName}
          localPreview={uploading ? preview : null}
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {label}
            {required ? <span className="ml-1 text-error" aria-label="required">*</span> : <span className="ml-1.5 text-xs font-normal text-muted-fg">Optional</span>}
          </p>
          {hint && !current && <p className="mt-0.5 text-xs text-muted-fg">{hint}</p>}

          {status && StatusIcon && (
            <p className={cn("mt-0.5 inline-flex items-center gap-1 text-xs font-medium", status.tone)}>
              <StatusIcon className="size-3.5" /> {status.text}
              {current?.expiryDate && <span className="font-normal text-muted-fg"> · expires {current.expiryDate}</span>}
            </p>
          )}
          {!plain && current?.rejectionReason && (
            <p className="mt-1 rounded-lg bg-error/10 px-2.5 py-1.5 text-xs text-error">Reason: {current.rejectionReason}</p>
          )}

          {uploading && (
            <div className="mt-2" role="progressbar" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${label}`}>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-teal-700 transition-[width] duration-fast dark:bg-accent" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-fg">Uploading {progress}%</p>
            </div>
          )}

          {error && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-error" role="alert">
              {error}
              {lastFile && !uploading && (
                <button type="button" onClick={() => void send(lastFile)} className="inline-flex items-center gap-1 font-medium underline">
                  <RefreshCw className="size-3" /> Try again
                </button>
              )}
            </p>
          )}

          {needsExpiry && canChange && !uploading && (
            <label className="mt-2 block text-xs font-medium text-muted-fg">
              Expiry date <span className="text-error">*</span>
              <Input type="date" min={todayIso()} value={expiry} onChange={(ev) => { setExpiry(ev.target.value); setError(null); }} className="mt-1 h-10" />
            </label>
          )}
        </div>
      </div>

      {canChange && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={current ? "outline" : "primary"} disabled={uploading} onClick={() => pick(fileInput.current)}>
            <Upload className="size-4" /> {current ? "Replace" : "Upload"}
          </Button>
          {hasCamera && (imagesOnly || !current) && (
            <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => pick(cameraInput.current)}>
              <Camera className="size-4" /> Take photo
            </Button>
          )}
          {current && canDelete && onDelete && (
            <Button
              type="button" size="sm" variant="danger" disabled={uploading || deleting}
              onClick={async () => {
                setDeleting(true);
                setError(null);
                try { await onDelete(); } catch (err) { setError(errorMessage(err)); } finally { setDeleting(false); }
              }}
            >
              <Trash2 className="size-4" /> Remove
            </Button>
          )}
        </div>
      )}
      {locked && current?.status !== "REJECTED" && (
        <p className="mt-2 text-xs text-muted-fg">Submitted. You can replace it if we ask for a new one.</p>
      )}

      <input ref={fileInput} type="file" hidden accept={imagesOnly ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"}
        onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) void send(f); }} />
      <input ref={cameraInput} type="file" hidden accept="image/*" capture="environment"
        onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) void send(f); }} />
    </div>
  );
}
