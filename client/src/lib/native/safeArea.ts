import { Capacitor } from "@capacitor/core";
import { StatusBar } from "@capacitor/status-bar";

/**
 * Android 15+ (API 35) enforces edge-to-edge and ignores
 * `overlaysWebView`/backgroundColor — the webview is drawn full-bleed under
 * the status/nav bars no matter what. `env(safe-area-inset-*)` in
 * globals.css handles the WebView content area correctly on iOS out of the
 * box, but Android's WebView needs the insets reported explicitly via
 * `--android-safe-area-*` custom properties, which this sets on <html> once
 * at native startup so every layout that already keys off safe-area env()
 * vars (tab bar, sheets, sticky headers) also picks up the Android values.
 *
 * Call once from App root on mount. Web (non-native) is a no-op — env()
 * insets resolve to 0 there anyway.
 */
export async function adjustMarginsForEdgeToEdge() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    const root = document.documentElement;
    // These are populated by the Android insets listener Capacitor wires up
    // internally for edge-to-edge; if unavailable, CSS env() safe-area
    // values (which Capacitor's WebView also reports) remain the fallback.
    root.style.setProperty("--safe-area-top", "env(safe-area-inset-top, 24px)");
    root.style.setProperty("--safe-area-bottom", "env(safe-area-inset-bottom, 16px)");
  } catch {
    // Non-fatal — layouts fall back to plain env(safe-area-inset-*).
  }
}
