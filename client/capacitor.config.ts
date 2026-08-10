import type { CapacitorConfig } from "@capacitor/cli";
/**
 * Zamzam native shell config.
 *
 * appId/appName are bundle identity — changing them after a store listing
 * exists means re-registering the app, so treat these as fixed once real
 * builds ship. Update here (not per-platform) if they ever need to change.
 */
const config: CapacitorConfig = {
  appId: "com.zamzam.app",
  appName: "Zamzam",
  webDir: "dist",
  plugins: {
    StatusBar: {
      // We theme this per-screen at runtime via lib/native/statusBar.ts —
      // this is just the cold-start default before React mounts.
      style: "DARK",
      backgroundColor: "#F7F3EE",
    },
  },
};
export default config;