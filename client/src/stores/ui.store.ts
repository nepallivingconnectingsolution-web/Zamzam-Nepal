import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";

interface UiState {
  theme: Theme;
  sidebarOpen: boolean;
  commandOpen: boolean;
  toggleTheme: () => void;
  setSidebar: (open: boolean) => void;
  setCommand: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "light",
      sidebarOpen: false,
      commandOpen: false,
      toggleTheme: () =>
        set((s) => {
          const theme = s.theme === "light" ? "dark" : "light";
          document.documentElement.classList.toggle("dark", theme === "dark");
          return { theme };
        }),
      setSidebar: (sidebarOpen) => set({ sidebarOpen }),
      setCommand: (commandOpen) => set({ commandOpen }),
    }),
    {
      name: "zz_ui",
      partialize: (s) => ({ theme: s.theme }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.classList.toggle("dark", state.theme === "dark");
        }
      },
    },
  ),
);
