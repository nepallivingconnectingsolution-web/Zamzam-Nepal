import { useEffect, useState } from "react";
import { CheckCircle2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OTPInput } from "@/components/ui/otp-input";
import { ApiError } from "@/api/client";
import type { Onboarding } from "../useOnboarding";
import { errorMessage } from "../useOnboarding";
import { StepShell } from "./ui";

type Props = Pick<Onboarding, "view" | "sendOtp" | "verifyOtp"> & { onNext: () => void };

const RESEND_SECONDS = 30;

/** Step 1: prove the phone number on the account by entering the code we text to it. */
export function PhoneStep({ view, sendOtp, verifyOtp, onNext }: Props) {
  const verified = !!view?.profile?.phoneVerifiedAt;
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  async function send() {
    setBusy("send");
    setError(null);
    setCode("");
    try {
      const r = await sendOtp();
      setSentTo(r.sentTo);
      setDevCode(r.devCode ?? null);
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError(errorMessage(err, "We couldn't send the code. Please try again."));
      if (err instanceof ApiError && err.status === 429) setWait(60);
    } finally {
      setBusy(null);
    }
  }

  async function verify(value: string) {
    if (value.length !== 6 || busy) return;
    setBusy("verify");
    setError(null);
    try {
      await verifyOtp(value);
      onNext();
    } catch (err) {
      setCode("");
      setError(errorMessage(err, "That code didn't work. Check it and try again."));
    } finally {
      setBusy(null);
    }
  }

  if (verified) {
    return (
      <StepShell title="Verify your phone" onNext={onNext} nextLabel="Continue">
        <div className="flex items-center gap-3 rounded-xl bg-success/10 p-4 text-success">
          <CheckCircle2 className="size-6 shrink-0" />
          <div>
            <p className="font-semibold">Phone number verified</p>
            <p className="text-sm">You're all set here. Let's move on.</p>
          </div>
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell
      title="Verify your phone"
      intro="Riders and support reach you on this number. We'll text a 6-digit code to the number on your account."
      onNext={() => void verify(code)}
      nextLabel="Verify and continue"
      nextDisabled={code.length !== 6 || !sentTo}
      saving={busy === "verify"}
      error={error}
    >
      {!sentTo ? (
        <Button type="button" variant="primary" size="lg" className="w-full" loading={busy === "send"} onClick={() => void send()}>
          <MessageSquare className="size-4" /> Send my code
        </Button>
      ) : (
        <div className="space-y-4">
          <p className="text-sm">
            We sent a code to <span className="font-mono font-semibold">{sentTo}</span>.
          </p>
          <OTPInput value={code} onChange={setCode} error={!!error} autoFocus disabled={busy === "verify"} />
          <button
            type="button"
            disabled={wait > 0 || busy === "send"}
            onClick={() => void send()}
            className="text-sm font-medium text-teal-700 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-fg disabled:no-underline dark:text-accent"
          >
            {wait > 0 ? `Send again in ${wait}s` : "Send a new code"}
          </button>
          {devCode && (
            <button
              type="button"
              onClick={() => setCode(devCode)}
              className="w-full rounded-lg bg-warning/10 px-3 py-2 text-left text-xs text-warning"
            >
              No real SMS was sent (test mode) — your code is{" "}
              <span className="font-mono font-semibold">{devCode}</span>. Tap to fill it in.
            </button>
          )}
        </div>
      )}
    </StepShell>
  );
}
