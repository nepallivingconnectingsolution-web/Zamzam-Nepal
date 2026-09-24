import { useEffect, useState, type ReactNode } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";

/** Building blocks shared by the driver and business review pages. */

export function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-h2 font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-fg">{label}</dt>
      <dd className="text-right font-medium">{value || "-"}</dd>
    </div>
  );
}

/** A sheet that asks for a written reason: the reviewer can't proceed without one. */
export function ReasonSheet({
  open, title, description, placeholder, confirmLabel, tone = "danger", required = true, quick, shortHint = "Give a reason so the driver knows what to fix.", busy, onClose, onConfirm, children,
}: {
  open: boolean;
  title: string;
  description?: string;
  placeholder: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  required?: boolean;
  quick?: string[];
  /** Shown under the box when the reason is too short. */
  shortHint?: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  const tooShort = required && reason.trim().length < 3;
  return (
    <BottomSheet open={open} onClose={onClose} title={title} description={description}>
      <form
        className="space-y-4 pt-1"
        onSubmit={(e) => { e.preventDefault(); if (!tooShort && !busy) onConfirm(reason.trim()); }}
      >
        {children}
        {quick && (
          <div className="flex flex-wrap gap-2" aria-label="Common reasons">
            {quick.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-surface-2">
                {r}
              </button>
            ))}
          </div>
        )}
        <div>
          <label htmlFor="reason" className="text-xs font-medium text-muted-fg">
            Reason {required && <span className="text-error">*</span>}
          </label>
          <textarea
            id="reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            className="mt-1 w-full rounded-md border border-input bg-surface p-3 text-sm focus-visible:border-teal-700 focus-visible:outline-none"
          />
          {required && reason.length > 0 && tooShort && <p className="mt-1 text-xs text-error" role="alert">{shortHint}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant={tone === "danger" ? "primary" : "accent"} size="lg" loading={busy} disabled={tooShort}>{confirmLabel}</Button>
        </div>
      </form>
    </BottomSheet>
  );
}
