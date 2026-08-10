import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/**
 * Thin wrapper around @capacitor/haptics that no-ops on web (desktop
 * browser, or this app running unwrapped). Every call site in the app goes
 * through these named moments rather than raw ImpactStyle/NotificationType
 * values, so "what haptic plays when" stays a design decision made in one
 * place instead of scattered per screen.
 */
const isNative = () => Capacitor.isNativePlatform();

async function safe(fn: () => Promise<void>) {
  if (!isNative()) return;
  try {
    await fn();
  } catch {
    // Haptics is best-effort UX polish — never let it throw into a booking
    // or payment flow.
  }
}

export const haptics = {
  /** Light tap feedback — toggles, tab switches, chip selection. */
  tap: () => safe(() => Haptics.impact({ style: ImpactStyle.Light })),
  /** Medium feedback — swipe-to-action reaching its commit threshold, pull-to-refresh triggered. */
  action: () => safe(() => Haptics.impact({ style: ImpactStyle.Medium })),
  /** Booking confirmed, payment success, OTP verified. */
  success: () => safe(() => Haptics.notification({ type: NotificationType.Success })),
  /** Form validation error, payment failure, OTP rejected. */
  error: () => safe(() => Haptics.notification({ type: NotificationType.Error })),
  /** Non-blocking warning — e.g. low wallet balance nudge. */
  warning: () => safe(() => Haptics.notification({ type: NotificationType.Warning })),
  /** Scrolling through a picker/segmented control option. */
  selectionChanged: () => safe(() => Haptics.selectionChanged()),
};
