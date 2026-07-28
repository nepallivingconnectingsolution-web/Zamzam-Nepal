import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "./auth.store";
import type { User } from "@/types";

const testUser: User = {
  id: "u1",
  name: "Anita Rai",
  email: "anita@example.com",
  mobile: "9812345678",
  role: "customer",
  kycStatus: "APPROVED",
  avatarUrl: null,
};

// Reset both the persisted sessionStorage blob and the in-memory store
// between tests — zustand's `persist` middleware otherwise leaks state
// across test cases via the shared jsdom sessionStorage.
beforeEach(() => {
  sessionStorage.clear();
  useAuthStore.setState({
    user: null,
    token: null,
    refreshToken: null,
    previewRole: "guest",
    isAuthenticated: false,
  });
});

describe("useAuthStore.setSession", () => {
  it("writes the access token to sessionStorage under the key api/client.ts reads", () => {
    useAuthStore.getState().setSession("access-token-123", testUser, "refresh-token-456");
    expect(sessionStorage.getItem("zz_token")).toBe("access-token-123");
    expect(sessionStorage.getItem("zz_refresh_token")).toBe("refresh-token-456");
  });

  it("marks the store authenticated with the signed-in user", () => {
    useAuthStore.getState().setSession("t", testUser);
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(testUser);
    expect(state.previewRole).toBe("customer");
  });
});

describe("useAuthStore.signOut", () => {
  it("clears both sessionStorage auth keys", () => {
    useAuthStore.getState().setSession("t", testUser, "r");
    useAuthStore.getState().signOut();
    expect(sessionStorage.getItem("zz_token")).toBeNull();
    expect(sessionStorage.getItem("zz_refresh_token")).toBeNull();
  });

  it("resets isAuthenticated, user and previewRole", () => {
    useAuthStore.getState().setSession("t", testUser, "r");
    useAuthStore.getState().signOut();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.previewRole).toBe("guest");
  });

  // PHASE1_AUDIT.md Medium #13: signOut only ever clears this store's own
  // keys. Screen-specific sessionStorage (e.g. the assistant chat
  // transcript) is a separate, not-yet-fixed leak on shared devices — this
  // test documents today's actual (narrower) contract so it fails loudly
  // if signOut's scope silently changes, rather than asserting a fix that
  // doesn't exist yet.
  it("does not touch unrelated sessionStorage keys outside its own auth state", () => {
    sessionStorage.setItem("zz_assistant_chat", JSON.stringify([{ role: "user", text: "hi" }]));
    useAuthStore.getState().setSession("t", testUser, "r");
    useAuthStore.getState().signOut();
    expect(sessionStorage.getItem("zz_assistant_chat")).not.toBeNull();
  });
});
