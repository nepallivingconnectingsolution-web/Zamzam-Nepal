// `vitest/config`'s defineConfig re-exports Vite's, merged with a typed
// `test` key — same runtime config object, just lets the block below
// type-check instead of needing a second config file kept in sync.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: { port: 5173, host: true, strictPort: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/main.tsx", "src/**/types.ts", "src/**/*.stories.tsx"],
      // Coverage threshold lives on high-risk, easy-to-get-subtly-wrong
      // utilities first (see PHASE1_AUDIT.md's "Next" section for the
      // rest of the client coverage plan) — not a blanket 95% yet.
      //
      // Note: per-file threshold glob matching against this repo's own
      // working-directory path ("zamzam testing", which contains a space)
      // has been unreliable locally on Windows — verified the *mechanism*
      // itself works via a global threshold test, but couldn't get this
      // specific per-file key to report reliably in this environment. CI
      // checks out to a space-free path, so re-verify there; if it's still
      // flaky, fall back to a global `coverage.thresholds` on this file's
      // own vitest project instead.
      thresholds: {
        "src/lib/utils.ts": { statements: 90, branches: 85, functions: 90, lines: 90 },
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          // charts: ["recharts"],
          charts: ["recharts", "apexcharts", "react-apexcharts"],
          motion: ["framer-motion"],
        },
      },
    },
  },
});
