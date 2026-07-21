import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

// Apply persisted theme before first paint to avoid a flash.
try {
  const stored = JSON.parse(localStorage.getItem("zz_ui") ?? "{}");
  if (stored?.state?.theme === "dark") document.documentElement.classList.add("dark");
} catch {
  /* ignore */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
