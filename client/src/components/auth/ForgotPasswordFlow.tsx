import * as React from "react";
import { CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { OTPInput } from "@/components/ui/otp-input";
import { PasswordStrengthMeter, scorePassword } from "@/components/ui/password-strength";
import { api, endpoints, ApiError } from "@/api/client";
import { haptics } from "@/lib/native/haptics";

type Step = "email" | "otp" | "password" | "done";

export interface ForgotPasswordFlowProps {
  open: boolean;
  onClose: () => void;
  /** Which identity table/endpoint namespace this reset targets. */
  mode?: "user" | "super-admin";
}

const RESEND_COOLDOWN_S = 60;

/**
 * Shared in-app forgot-password flow — one component used by both the
 * regular login screen (customer/driver/every partner vertical, all share
 * one `users` row) and the super-admin login (separate identity table,
 * separate endpoints). No email deep link: everything happens in-app via a
 * 6-digit OTP, so there's no Universal/App Links setup and the user is
 * never kicked out to a browser mid-flow.
 */
export function ForgotPasswordFlow({ open, onClose, mode = "user" }: ForgotPasswordFlowProps) {
  const eps = mode === "super-admin" ? endpoints.superAdminAuth : endpoints.auth;

  const [step, setStep] = React.useState<Step>("email");
  const [email, setEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);

  // Reset all local state whenever the sheet is fully closed, so reopening
  // it (e.g. after "done") always starts from step 1 instead of resuming
  // wherever the last attempt left off.
  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStep("email");
        setEmail("");
        setOtp("");
        setPassword("");
        setConfirmPassword("");
        setError(null);
        setLoading(false);
        setCooldown(0);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function requestOtp() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Server always returns a generic success response here regardless of
      // whether the email exists, to avoid leaking which emails are
      // registered — so the UI has nothing account-specific to branch on.
      await api.post(eps.forgotPassword, { email });
      setStep("otp");
      setCooldown(RESEND_COOLDOWN_S);
    } catch (e) {
      const detail = e instanceof ApiError ? (e.detail as { message?: string }) : null;
      setError(detail?.message ?? "Couldn't send the code. Please try again in a moment.");
      void haptics.error();
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(code: string) {
    setLoading(true);
    setError(null);
    try {
      await api.post(eps.verifyResetOtp, { email, otp: code });
      void haptics.success();
      setStep("password");
    } catch (e) {
      const detail = e instanceof ApiError ? (e.detail as { message?: string }) : null;
      setError(detail?.message ?? "That code is incorrect or has expired.");
      void haptics.error();
    } finally {
      setLoading(false);
    }
  }

  async function submitNewPassword() {
    if (scorePassword(password) < 2) {
      setError("Choose a stronger password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post(eps.resetPassword, { email, otp, newPassword: password });
      void haptics.success();
      setStep("done");
    } catch (e) {
      const detail = e instanceof ApiError ? (e.detail as { message?: string }) : null;
      setError(detail?.message ?? "Couldn't reset your password. Please start again.");
      void haptics.error();
    } finally {
      setLoading(false);
    }
  }

  const titles: Record<Step, string> = {
    email: "Reset your password",
    otp: "Enter the code",
    password: "Choose a new password",
    done: "Password updated",
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={titles[step]}>
      <div className="space-y-4 pb-2">
        {step === "email" && (
          <>
            <p className="text-sm text-muted-fg">
              Enter the email on your account — we'll send a 6-digit code to verify it's you.
            </p>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />
              <Input
                type="email"
                autoFocus
                placeholder="you@example.com"
                className="pl-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && requestOtp()}
              />
            </div>
            {error && <p className="text-xs font-medium text-danger">{error}</p>}
            <Button variant="accent" size="lg" className="w-full" onClick={requestOtp} disabled={loading}>
              {loading ? "Sending code…" : "Send code"}
            </Button>
          </>
        )}

        {step === "otp" && (
          <>
            <p className="text-sm text-muted-fg">
              We sent a 6-digit code to <span className="font-medium text-fg">{email}</span>. It expires in 10
              minutes.
            </p>
            <OTPInput value={otp} onChange={setOtp} onComplete={verifyOtp} disabled={loading} error={!!error} autoFocus />
            {error && <p className="text-xs font-medium text-danger">{error}</p>}
            <Button
              variant="accent"
              size="lg"
              className="w-full"
              onClick={() => verifyOtp(otp)}
              disabled={loading || otp.length < 6}
            >
              {loading ? "Verifying…" : "Verify code"}
            </Button>
            <button
              type="button"
              onClick={requestOtp}
              disabled={cooldown > 0 || loading}
              className="w-full text-center text-xs font-medium text-muted-fg disabled:opacity-60"
            >
              {cooldown > 0 ? (
                <>
                  Resend code in <span className="font-tabular">{cooldown}s</span>
                </>
              ) : (
                <span className="text-accent-600 dark:text-accent">Resend code</span>
              )}
            </button>
          </>
        )}

        {step === "password" && (
          <>
            <PasswordInput
              leadingIcon={<KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />}
              placeholder="New password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordStrengthMeter password={password} />
            <PasswordInput
              leadingIcon={<ShieldCheck className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />}
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNewPassword()}
            />
            {error && <p className="text-xs font-medium text-danger">{error}</p>}
            <Button variant="accent" size="lg" className="w-full" onClick={submitNewPassword} disabled={loading}>
              {loading ? "Updating…" : "Update password"}
            </Button>
          </>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="size-7 text-success" />
            </span>
            <p className="text-sm text-muted-fg">
              Your password has been updated. Any other signed-in devices have been signed out for your security.
            </p>
            <Button variant="primary" size="lg" className="w-full" onClick={onClose}>
              Back to sign in
            </Button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
