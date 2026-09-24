/**
 * Called after an admin action (or the expiry job) takes a driver out of
 * service, so the dispatch side can remove them from the live pool and tell
 * their app. Kept as a token + interface so onboarding never imports dispatch
 * code directly.
 */
export const DRIVER_OFFLINE_HOOK = Symbol('DRIVER_OFFLINE_HOOK');

export interface DriverOfflineHook {
  onDriverForcedOffline(driverId: string, reason: string): Promise<void>;
}
