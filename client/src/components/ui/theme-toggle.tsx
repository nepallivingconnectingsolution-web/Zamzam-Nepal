import { Moon, Sun } from "lucide-react";
import { useUiStore } from "@/stores/ui.store";
import { Button } from "./button";

export function ThemeToggle() {
  const { theme, toggleTheme } = useUiStore();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
    </Button>
  );
}
