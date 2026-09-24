import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Mail, MessageSquare } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { AppFrame } from "@/components/layout/app-frame";
import { Button } from "@/components/ui/button";
import { OTPInput } from "@/components/ui/otp-input";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { api, endpoints, ApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth.store";
import { toast } from "@/stores/toast.store";
import { ROLE_HOME } from "@/config";
import type { User } from "@/types";

const RESEND_SECONDS = 30;

type Channel = "email" | "mobile";

type VerifyResponse =
  | { verified: true; fullyVerified: false }
  | { verified: true; fullyVerified: true; accessToken: string; refreshToken: string; user: User; profileComplete: boolean };

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback;
  return fallback;
}

/**
 * Two sequential one-time codes — email, then mobile — stand between a
 * freshly registered (or previously abandoned) account and its first real
 * session. Landed on either right after register() (which already tells us
 * the address/number to show) or after login() refuses an unverified
 * account (VERIFICATION_REQUIRED, carrying only the userId — this page
 * fills in the display text itself from each "send" response's masked
 * `sentTo`). The very last successful verify call returns real tokens, so
 * this doubles as the login step once both are confirmed.
 */
export function VerifyAccountPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuthStore();
  const state = location.state as { userId?: string; email?: string; from?: string } | null;

  const [step, setStep] = useState<Channel>("email");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (!state?.userId) navigate("/login", { replace: true });
  }, [state?.userId, navigate]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  if (!state?.userId) return null;
  const userId = state.userId;

  function enterSession(res: Extract<VerifyResponse, { fullyVerified: true }>) {
    setSession(res.accessToken, res.user, res.refreshToken);
    toast.success("Account verified", "You're all set.");
    if (!res.profileComplete && res.user.role !== "driver") {
      navigate("/profile/setup", { state: { from: state?.from } });
    } else if (state?.from && res.user.role === "customer") {
      navigate(state.from);
    } else {
      navigate(ROLE_HOME[res.user.role]);
    }
  }

  async function send() {
    setBusy("send");
    setError(null);
    setCode("");
    try {
      const path = step === "email" ? endpoints.auth.resendEmailOtp : endpoints.auth.resendMobileOtp;
      const r = await api.post<{ sentTo: string }>(path, { userId }, { auth: false });
      setSentTo(r.sentTo);
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
      const path = step === "email" ? endpoints.auth.verifyEmail : endpoints.auth.verifyMobile;
      const res = await api.post<VerifyResponse>(path, { userId, otp: value }, { auth: false });
      if (res.fullyVerified) {
        enterSession(res);
        return;
      }
      // Email confirmed, mobile still pending (or vice versa) — reset for the next channel.
      setStep((s) => (s === "email" ? "mobile" : "email"));
      setSentTo(null);
      setCode("");
      setWait(0);
    } catch (err) {
      setCode("");
      setError(errorMessage(err, "That code didn't work. Check it and try again."));
    } finally {
      setBusy(null);
    }
  }

  const isEmail = step === "email";
  const label = isEmail ? "email" : "mobile number";
  const icon = isEmail ? <Mail className="size-4" /> : <MessageSquare className="size-4" />;
  const displayTarget = sentTo ?? (isEmail ? state?.email : undefined);

  return (
    <AppFrame>
      <div className="flex flex-1 flex-col">
        <header className="flex h-[calc(3.25rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 px-4 pt-[env(safe-area-inset-top)] lg:px-10">
          <Logo />
          <div className="ml-auto"><ThemeToggle /></div>
        </header>

        <div className="mx-auto w-full max-w-sm flex-1 px-6 pb-8 pt-4">
          <div className="mb-6 flex items-center gap-2">
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${isEmail ? "bg-teal-100 text-teal-700 dark:bg-white/10 dark:text-accent" : "bg-surface-2 text-muted-fg"}`}>
              <Mail className="size-4" /> Email
            </div>
            <div className="h-px flex-1 bg-border" />
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${!isEmail ? "bg-teal-100 text-teal-700 dark:bg-white/10 dark:text-accent" : "bg-surface-2 text-muted-fg"}`}>
              <MessageSquare className="size-4" /> Mobile
            </div>
          </div>

          <h2 className="font-display text-2xl font-bold tracking-tight">Verify your {label}</h2>
          <p className="mt-1 text-sm text-muted-fg">
            {isEmail
              ? "We'll send a 6-digit code to confirm this is really your email address."
              : "Now let's confirm your mobile number the same way."}
          </p>

          <div className="mt-6 space-y-4">
            {!sentTo ? (
              <Button type="button" variant="accent" size="lg" className="w-full" loading={busy === "send"} onClick={() => void send()}>
                {icon} Send my code
              </Button>
            ) : (
              <>
                <p className="text-sm">
                  We sent a code to <span className="font-mono font-semibold">{displayTarget}</span>.
                </p>
                <OTPInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} error={!!error} autoFocus disabled={busy === "verify"} />
                <Button type="button" variant="accent" size="lg" className="w-full" loading={busy === "verify"} disabled={code.length !== 6} onClick={() => void verify(code)}>
                  Verify and continue
                </Button>
                <button
                  type="button"
                  disabled={wait > 0 || busy === "send"}
                  onClick={() => void send()}
                  className="text-sm font-medium text-teal-700 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-fg disabled:no-underline dark:text-accent"
                >
                  {wait > 0 ? `Send again in ${wait}s` : "Send a new code"}
                </button>
              </>
            )}

            {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}

            {!isEmail && (
              <div className="flex items-center gap-2 text-xs text-muted-fg">
                <CheckCircle2 className="size-3.5 text-success" /> Email verified
              </div>
            )}
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
