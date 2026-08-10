import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

/**
 * Per-screen status bar theming. Call `setStatusBarTheme("dark" | "light")`
 * from a screen-level effect — "dark" means dark *content* (for light
 * backgrounds), "light" means light content (for our deep petrol/ink
 * surfaces). Naming matches how designers talk about status bar content,
 * not Capacitor's inverted Style.Dark/Style.Light enum (see below).
 *
 * No-ops on web so every screen can call this unconditionally.
 */
type StatusBarTheme = "dark-content" | "light-content";

const isNative = () => Capacitor.isNativePlatform();

export async function setStatusBarTheme(theme: StatusBarTheme, backgroundColor?: string) {
  if (!isNative()) return;
  try {
    // Capacitor's Style.Dark = "dark background, light text" — i.e. the
    // opposite of what "dark content" reads as in plain English. We invert
    // here so call sites never have to remember that.
    await StatusBar.setStyle({ style: theme === "dark-content" ? Style.Light : Style.Dark });
    if (backgroundColor) {
      // No-op on Android 15+ (edge-to-edge enforced) and when overlaysWebView
      // is true, but harmless to call — kept for older Android targets.
      await StatusBar.setBackgroundColor({ color: backgroundColor });
    }
  } catch {
    // Best-effort — never block screen render on status bar theming.
  }
}

export async function setStatusBarOverlay(overlay: boolean) {
  if (!isNative()) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay });
  } catch {
    /* noop */
  }
}
