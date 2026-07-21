/**
 * Shared geo math for the mobility services (driver matching, ride fares).
 * Haversine straight-line distance is the architecture doc's accepted MVP
 * stand-in for real road routing until a Directions API is wired in.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Rough city ETA at ~20 km/h average valley traffic speed, minimum 1 min. */
export function etaMinutes(distanceKm: number): number {
  return Math.max(1, Math.round((distanceKm / 20) * 60));
}

/**
 * MVP fare model, NPR. Server-side is authoritative — the client shows the
 * same formula only as a preview. Tune freely; nothing else depends on the
 * exact numbers.
 */
export const FARES: Record<'taxi' | 'bike' | 'parcel', { base: number; perKm: number; min: number }> = {
  taxi: { base: 100, perKm: 45, min: 150 },
  bike: { base: 50, perKm: 25, min: 80 },
  parcel: { base: 80, perKm: 30, min: 100 },
};

export function fareFor(service: 'taxi' | 'bike' | 'parcel', distanceKm: number): number {
  const f = FARES[service];
  return Math.max(f.min, Math.round(f.base + f.perKm * distanceKm));
}