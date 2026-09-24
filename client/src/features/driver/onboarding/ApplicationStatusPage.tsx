import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, BadgeCheck, CheckCircle2, Clock, Hourglass, ShieldOff, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Onboarding } from "./useOnboarding";
import { errorMessage } from "./useOnboarding";
import { FileUploader } from "./FileUploader";
import { canChangeDoc, needsNewUpload } from "./docs";
import { STATUS_LABEL, type ApplicationView } from "./onboarding.types";

interface Props {
  ob: Pick<Onboarding, "upload" | "removeUpload" | "submit" | "reopen">;
  view: ApplicationView;
  justSubmitted?: boolean;
  /** Open the wizard, optionally at a given step. */
  onEdit: (step?: number) => void;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const TONE: Record<string, { badge: "default" | "warning" | "success" | "danger" | "accent"; icon: typeof Clock; ring: string }> = {
  SUBMITTED: { badge: "warning", icon: Hourglass, ring: "bg-warning/10 text-warning" },
  UNDER_REVIEW: { badge: "warning", icon: Hourglass, ring: "bg-warning/10 text-warning" },
  RESUBMISSION_REQUIRED: { badge: "danger", icon: AlertTriangle, ring: "bg-error/10 text-error" },
  EXPIRED: { badge: "danger", icon: AlertTriangle, ring: "bg-error/10 text-error" },
  REJECTED: { badge: "danger", icon: XCircle, ring: "bg-error/10 text-error" },
  SUSPENDED: { badge: "danger", icon: ShieldOff, ring: "bg-error/10 text-error" },
  APPROVED: { badge: "success", icon: BadgeCheck, ring: "bg-success/10 text-success" },
  DRAFT: { badge: "default", icon: Clock, ring: "bg-surface-2 text-muted-fg" },
};

function Timeline({ status }: { status: string }) {
  const reviewing = status === "SUBMITTED" || status === "UNDER_REVIEW";
  const items = [
    { label: "Application submitted", state: "done" },
    { label: status === "UNDER_REVIEW" ? "Our team is reviewing it" : "Waiting for a reviewer", state: reviewing ? "current" : "done" },
    { label: "Approved. Go online and start earning", state: "todo" },
  ] as const;
  return (
    <ol className="space-y-3" aria-label="What happens next">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-3 text-sm">
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full",
              it.state === "done" && "bg-success text-white",
              it.state === "current" && "border-2 border-teal-700 text-teal-700 dark:border-accent dark:text-accent",
              it.state === "todo" && "border border-border text-muted-fg",
            )}
          >
            {it.state === "done" ? <CheckCircle2 className="size-4" /> : it.state === "current" ? <span className="size-2 animate-pulse rounded-full bg-current" /> : null}
          </span>
          <span className={cn(it.state === "todo" && "text-muted-fg", it.state === "current" && "font-semibold")}>{it.label}</span>
        </li>
      ))}
    </ol>
  );
}

const DOC_STATUS: Record<string, { text: string; className: string }> = {
  PENDING: { text: "Waiting", className: "text-warning" },
  APPROVED: { text: "Approved", className: "text-success" },
  REJECTED: { text: "Rejected", className: "text-error" },
  RESUBMISSION_REQUIRED: { text: "Upload again", className: "text-error" },
  EXPIRED: { text: "Expired", className: "text-error" },
};

/** Where the application stands, and the one thing to do next in every state. */
export function ApplicationStatusPage({ ob, view, justSubmitted, onEdit }: Props) {
  const navigate = useNavigate();
  const status = view.application.status;
  const tone = TONE[status] ?? TONE.DRAFT;
  const Icon = tone.icon;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flagged = view.requirements.filter(needsNewUpload);
  const licenceProblem = view.blockers.find((b) => b.code.startsWith("LICENCE"));
  const reviewing = status === "SUBMITTED" || status === "UNDER_REVIEW";

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-e1">
        <div className="flex items-start gap-4">
          <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl", tone.ring)}>
            <Icon className="size-6" />
          </span>
          <div className="min-w-0">
            <Badge variant={tone.badge}>{STATUS_LABEL[status]}</Badge>
            <h1 className="mt-2 font-display text-h1 font-bold" aria-live="polite">
              {justSubmitted && reviewing ? "Application submitted" : status === "APPROVED" ? "You're approved" : view.statusMessage}
            </h1>
            {justSubmitted && reviewing && <p className="mt-1 text-sm text-muted-fg">{view.statusMessage}</p>}
            {status === "APPROVED" && <p className="mt-1 text-sm text-muted-fg">{view.statusMessage}</p>}
          </div>
        </div>
      </section>

      {reviewing && (
        <>
          <section className="rounded-2xl border border-border p-5">
            <Timeline status={status} />
          </section>
          <section className="rounded-2xl border border-border p-5" aria-label="What we're checking">
            <h2 className="font-display text-h2 font-bold">What we're checking</h2>
            <ul className="mt-3 divide-y divide-border">
              {view.requirements.filter((r) => r.current).map((r) => {
                const s = DOC_STATUS[r.current!.status];
                return (
                  <li key={r.docType} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>{cap(r.label)}</span>
                    <span className={cn("font-medium", s.className)}>{s.text}</span>
                  </li>
                );
              })}
            </ul>
          </section>
          <p className="text-center text-sm text-muted-fg">We'll send you a notification as soon as there's news. You can close this page.</p>
        </>
      )}

      {(status === "RESUBMISSION_REQUIRED" || status === "EXPIRED") && (
        <section className="space-y-4" aria-label="What needs your attention">
          <h2 className="font-display text-h2 font-bold">What needs your attention</h2>
          {view.application.rejectionReason && status === "RESUBMISSION_REQUIRED" && (
            <p className="rounded-xl bg-error/10 p-3 text-sm text-error">Note from our team: {view.application.rejectionReason}</p>
          )}
          {licenceProblem && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/40 p-3">
              <p className="text-sm font-medium text-error">{licenceProblem.message}</p>
              <Button size="sm" variant="outline" onClick={() => onEdit(2)}>Update licence</Button>
            </div>
          )}
          {flagged.map((r) => (
            <FileUploader
              key={r.docType}
              label={cap(r.label)}
              required={r.isRequired}
              requiresExpiry={r.requiresExpiry}
              imagesOnly={r.kind === "PHOTO"}
              current={r.current}
              canChange={canChangeDoc(status, r.current)}
              onUpload={async (file, expiry, onProgress) => void (await ob.upload(r.docType, file, expiry, onProgress))}
            />
          ))}
          {flagged.length === 0 && !licenceProblem && (
            <p className="text-sm text-muted-fg">Review your details, then send your application again.</p>
          )}

          {error && <p className="rounded-lg bg-error/10 px-3 py-2 text-sm font-medium text-error" role="alert">{error}</p>}
          {!view.canSubmit && view.blockers[0] && (
            <p className="text-sm text-muted-fg">Before you can resubmit: {view.blockers[0].message}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="accent" size="lg" className="flex-1" disabled={!view.canSubmit} loading={busy} onClick={() => void run(ob.submit)}>
              Resubmit application
            </Button>
            <Button variant="outline" size="lg" onClick={() => onEdit()}>Edit my details</Button>
          </div>
        </section>
      )}

      {status === "REJECTED" && (
        <section className="space-y-3">
          {error && <p className="rounded-lg bg-error/10 px-3 py-2 text-sm font-medium text-error" role="alert">{error}</p>}
          <p className="text-sm text-muted-fg">You can correct the problems and apply again. Your details are kept, so you won't start from scratch.</p>
          <Button variant="accent" size="lg" className="w-full" loading={busy} onClick={() => void run(async () => { await ob.reopen(); onEdit(); })}>
            Update and apply again
          </Button>
        </section>
      )}

      {status === "SUSPENDED" && (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted-fg">
          You can't go online while your account is suspended. If you think this is a mistake, contact ZamZam support with your registered phone number.
        </p>
      )}

      {status === "APPROVED" && (
        <Button variant="accent" size="lg" className="w-full" onClick={() => navigate("/driver")}>
          Open driver dashboard
        </Button>
      )}
    </div>
  );
}
