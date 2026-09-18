import { useEffect, useRef, useState } from "react";

/**
 * Loads the Google Identity Services script once (it's idempotent across
 * multiple components mounting the hook — the script tag and the global
 * `google` object are both shared, only the callback per-click changes) and
 * exposes a `prompt(callback)` that triggers Google's One Tap / account
 * chooser and resolves with the signed ID token.
 *
 * Deliberately NOT `@react-oauth/google` or Google's own rendered button:
 * this app has its own fully custom `Button` component and every other
 * screen matches it, so a foreign-styled embed would be the one button that
 * doesn't belong. `google.accounts.id.prompt()` triggered from a
 * custom-styled button is Google's documented way to do exactly that.
 */

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          prompt: (momentListener?: (notification: GoogleMomentNotification) => void) => void;
        };
      };
    };
  }
}

interface GoogleMomentNotification {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getDismissedReason: () => "credential_returned" | "cancel_called" | "flow_restarted" | "unknown_reason";
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

let scriptLoadPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services.")));
      if (window.google?.accounts?.id) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services."));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

export function useGoogleIdentity() {
  const [ready, setReady] = useState(false);
  const callbackRef = useRef<((credential: string) => void) | null>(null);

  useEffect(() => {
    if (!CLIENT_ID) return; // Feature quietly disables itself without the env var set.
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => callbackRef.current?.(response.credential),
        });
        setReady(true);
      })
      .catch(() => setReady(false));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Triggers the Google account chooser; resolves the ID token via `onToken`. */
  function prompt(onToken: (credential: string) => void, onUnavailable?: () => void) {
    if (!ready || !window.google) {
      onUnavailable?.();
      return;
    }
        callbackRef.current = onToken;
    window.google.accounts.id.prompt((notification) => {
      const dismissedForSuccess =
        notification.isDismissedMoment() && notification.getDismissedReason() === "credential_returned";
      if (!dismissedForSuccess && (notification.isNotDisplayed() || notification.isSkippedMoment() || notification.isDismissedMoment())) {
        onUnavailable?.();
      }
    });
  }

  return { ready: ready && !!CLIENT_ID, prompt };
}
