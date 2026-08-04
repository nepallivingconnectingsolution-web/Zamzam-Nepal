import { defineConfig, devices } from '@playwright/test';

/**
 * Drives the real client + server against an ephemeral, in-memory Postgres
 * (see server/scripts/e2e-server.ts) — never the real Neon database, no
 * Docker required. `workers: 1` and `fullyParallel: false` are deliberate:
 * every spec shares one live backend + one live app instance with real
 * auth/wallet/booking state, so tests run serially rather than risking
 * cross-test data races for the sake of speed. Revisit if the suite grows
 * large enough that serial execution becomes the bottleneck — at that
 * point, isolate per-test data (unique users per test already does most of
 * this) rather than just cranking up parallelism.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run e2e:server',
      cwd: '../server',
      // No route is mapped at "/" (every controller has a path prefix), and
      // Playwright's webServer readiness check requires a 2xx response, not
      // just any HTTP response — a 404 here polls forever until timeout.
      // /cms is real, public (no auth), and cheap.
      url: 'http://localhost:4000/cms',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev',
      cwd: '../client',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { VITE_API_URL: 'http://localhost:4000' },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
