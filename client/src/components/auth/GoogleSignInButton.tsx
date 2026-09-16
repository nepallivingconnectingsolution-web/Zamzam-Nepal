import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useGoogleIdentity } from "@/hooks/useGoogleIdentity";
import { api, endpoints, ApiError } from "@/api/client";
import type { User } from "@/types";

type GoogleAuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
  profileComplete: boolean;
};

interface GoogleSignInButtonProps {
  onSuccess: (res: GoogleAuthResponse) => void;
  /** Surfaced inline by the caller, same error slot as the password form. */
  onError: (message: string) => void;
  label?: string;
}

/**
 * "Continue with Google" — customer accounts only. Renders nothing if
 * VITE_GOOGLE_CLIENT_ID isn't configured, so the feature degrades cleanly
 * in any environment that hasn't set it up yet.
 */
export function GoogleSignInButton({ onSuccess, onError, label = "Continue with Google" }: GoogleSignInButtonProps) {
  const { ready, prompt } = useGoogleIdentity();
  const [loading, setLoading] = useState(false);

  if (!ready) return null;

  async function handleClick() {
    prompt(
      async (idToken) => {
        setLoading(true);
        try {
          const res = await api.post<GoogleAuthResponse>(endpoints.auth.google, { idToken }, { auth: false });
          onSuccess(res);
        } catch (e) {
          const detail = e instanceof ApiError ? (e.detail as { message?: string }) : null;
          onError(detail?.message ?? "Couldn't sign in with Google. Please try again.");
        } finally {
          setLoading(false);
        }
      },
      () => onError("Google sign-in was cancelled or is unavailable right now."),
    );
  }

  return (
    <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleClick} loading={loading}>
      <GoogleGlyph />
      {label}
    </Button>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 18 18" className="size-4 shrink-0" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
    </svg>
  );
}
