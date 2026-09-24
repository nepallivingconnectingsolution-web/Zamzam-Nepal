import { useCallback, useEffect, useState } from "react";
import { api, ApiError, endpoints } from "@/api/client";
import { useAuthStore } from "@/stores/auth.store";
import type { ApplicationView } from "./onboarding.types";

const e = endpoints.driverOnboarding;

/** The message to show a person for any failed call. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ApiError) return err.message || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export interface SaveProfileBody {
  [field: string]: string | number | undefined;
}

/**
 * The driver's application, loaded from the server and updated from each
 * write's response (every write returns the full, current application, so the
 * screen can never drift from what the server holds).
 */
export function useOnboarding() {
  const [view, setView] = useState<ApplicationView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setState("loading");
    try {
      setView(await api.get<ApplicationView>(e.application));
      setState("ready");
      setError(null);
    } catch (err) {
      if (!silent) {
        setState("error");
        setError(errorMessage(err, "We couldn't load your application."));
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = (next: ApplicationView) => {
    setView(next);
    return next;
  };

  return {
    view,
    state,
    error,
    reload: () => load(),
    refresh: () => load(true),

    sendOtp: () => api.post<{ sentTo: string; expiresInSeconds: number }>(e.otpSend),
    verifyOtp: async (code: string) => {
      await api.post(e.otpVerify, { code });
      await load(true);
    },

    saveProfile: async (body: SaveProfileBody) => apply(await api.put<ApplicationView>(e.profile, body)),
    saveVehicle: async (body: Record<string, string | number | undefined>) =>
      apply(await api.put<ApplicationView>(e.vehicle, body)),

    upload: async (docType: string, file: File, expiryDate: string | undefined, onProgress?: (n: number) => void) => {
      const form = new FormData();
      form.append("docType", docType);
      if (expiryDate) form.append("expiryDate", expiryDate);
      form.append("file", file);
      return apply(await api.uploadWithProgress<ApplicationView>(e.files, form, onProgress));
    },
    removeUpload: async (docId: string) => apply(await api.delete<ApplicationView>(e.file(docId))),

    submit: async () => apply(await api.post<ApplicationView>(e.submit)),
    reopen: async () => apply(await api.post<ApplicationView>(e.reopen)),
  };
}

export type Onboarding = ReturnType<typeof useOnboarding>;

/**
 * Form values for one step. Anything typed but not yet saved is mirrored to
 * localStorage so a refresh, a dropped connection or a closed tab never loses
 * it; once a step is saved the mirror is cleared and the server copy rules.
 */
export function useStepDraft<T extends object>(step: string, initial: T) {
  const userId = useAuthStore((s) => s.user?.id ?? "anon");
  const key = `zz_driver_draft_v1:${userId}:${step}`;

  const [values, setValues] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return { ...initial, ...(JSON.parse(raw) as Partial<T>) };
    } catch {
      // storage blocked or corrupt: start from the server values
    }
    return initial;
  });

  useEffect(() => {
    try {
      if (JSON.stringify(values) === JSON.stringify(initial)) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(values));
    } catch {
      // ignore: the draft is a convenience, not a requirement
    }
    // `initial` is only the baseline for "has the person changed anything".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, key]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [key]);

  return [values, setValues, clear] as const;
}
