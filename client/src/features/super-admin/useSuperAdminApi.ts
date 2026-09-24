import { useCallback } from "react";
import { useSuperAdminStore } from "@/stores/super-admin.store";

/**
 * Super-admin data access — talks to the real backend's dedicated
 * super-admin auth domain (separate JWT secret/strategy from regular
 * users; see server/src/modules/super-admin). Carries the super-admin
 * token from its own zustand store, never localStorage.zz_token.
 */
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class SuperAdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "SuperAdminApiError";
  }
}

export function useSuperAdminApi() {
  const { token, clearSession } = useSuperAdminStore();

  const saApi = useCallback(
    async function saApi<T>(
      path: string,
      options: { method?: Method; body?: unknown } = {},
    ): Promise<T> {
      const method = options.method ?? "GET";

      const res = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });

      if (res.status === 401) {
        // The super-admin session has expired or the token is invalid —
        // there is no refresh-token flow for this privileged account by
        // design (sessions are shorter-lived and re-auth is intentionally
        // required), so sign out and let SuperAdminGuard redirect to login.
        clearSession();
        throw new SuperAdminApiError(401, "Your session has expired. Please sign in again.");
      }

      if (!res.ok) {
        let message = "Something went wrong. Please try again.";
        let code: string | undefined;
        try {
          const body = await res.json();
          if (body && typeof body.message === "string") message = body.message;
          if (body && typeof body.code === "string") code = body.code;
        } catch {
          // ignore, use generic message
        }
        throw new SuperAdminApiError(res.status, message, code);
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
    [token, clearSession],
  );

  /**
   * Private files (driver documents) are not public URLs: fetch the bytes with
   * the admin token and show them from an in-memory object URL.
   */
  const saBlob = useCallback(
    async (path: string): Promise<Blob> => {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        cache: "no-store",
      });
      if (res.status === 401) {
        clearSession();
        throw new SuperAdminApiError(401, "Your session has expired. Please sign in again.");
      }
      if (!res.ok) throw new SuperAdminApiError(res.status, "Couldn't load this file.");
      return res.blob();
    },
    [token, clearSession],
  );

  return { saApi, saBlob };
}
