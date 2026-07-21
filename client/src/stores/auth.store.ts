import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Role, User } from "@/types";

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  previewRole: Role; // kept for the existing role-switcher / preview shells
  isAuthenticated: boolean;
  setSession: (token: string, user: User, refreshToken?: string) => void;
 setAccessToken: (token: string) => void;
  /** Merge a partial update into the signed-in user (e.g. after saving Settings). */
  updateUser: (patch: Partial<User>) => void;
  setPreviewRole: (role: Role) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      previewRole: "guest",
      isAuthenticated: false,
      setSession: (token, user, refreshToken) => {
        sessionStorage.setItem("zz_token", token); // api/client.ts reads this
        if (refreshToken) sessionStorage.setItem("zz_refresh_token", refreshToken);
        set({
          token,
          user,
          refreshToken: refreshToken ?? null,
          previewRole: user.role,
          isAuthenticated: true,
        });
      },
      setAccessToken: (token) => {
        sessionStorage.setItem("zz_token", token);
        set({ token });
      },
      updateUser: (patch) =>
        set((s) => (s.user ? { user: { ...s.user, ...patch } } : {})),
      setPreviewRole: (previewRole) => set({ previewRole }),
      signOut: () => {
        sessionStorage.removeItem("zz_token");
        sessionStorage.removeItem("zz_refresh_token");
        set({ user: null, token: null, refreshToken: null, previewRole: "guest", isAuthenticated: false });
      },
    }),
    {
      name: "zz_auth",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        user: s.user,
        token: s.token,
        refreshToken: s.refreshToken,
        previewRole: s.previewRole,
        isAuthenticated: s.isAuthenticated,
      }),
    },
  ),
);