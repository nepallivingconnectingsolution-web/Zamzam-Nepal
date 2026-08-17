import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";

// Self-hosted type system — see tailwind.config.ts fontFamily. Variable
// fonts: one file each covers the whole weight axis, so the display face
// can go from 500 to 800 without extra requests. Self-hosted rather than
// CDN-linked because this ships as a native Capacitor app and must render
// correctly on a cold, offline launch.
import "@fontsource-variable/plus-jakarta-sans"; // display — prices, times, routes
import "@fontsource-variable/public-sans"; // body — labels, descriptions, fields
import "@fontsource-variable/jetbrains-mono"; // booking refs, IDs

import "./styles/globals.css";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

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
