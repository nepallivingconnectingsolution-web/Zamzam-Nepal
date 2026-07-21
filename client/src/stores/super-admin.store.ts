import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface SuperAdminUser {
  id: string;
  name: string;
  email: string;
}

interface SuperAdminState {
  token: string | null;
  admin: SuperAdminUser | null;
  isAuthenticated: boolean;
  setSession: (token: string, admin: SuperAdminUser) => void;
  clearSession: () => void;
}

export const useSuperAdminStore = create<SuperAdminState>()(
  persist(
    (set) => ({
      token: null,
      admin: null,
      isAuthenticated: false,
      setSession: (token, admin) => set({ token, admin, isAuthenticated: true }),
      clearSession: () => set({ token: null, admin: null, isAuthenticated: false }),
    }),
    {
      name: "zz_sa",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        token: s.token,
        admin: s.admin,
        isAuthenticated: s.isAuthenticated,
      }),
    },
  ),
);