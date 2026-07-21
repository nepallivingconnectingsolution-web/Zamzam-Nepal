/**
 * Date-range helpers for the hotel booking system. checkIn is inclusive,
 * checkOut is exclusive (the night of checkOut itself is not booked) — the
 * same convention hotel booking systems universally use, so a guest
 * checking out on the 5th doesn't block a new guest checking in on the 5th.
 */

export function nightsBetween(checkIn: string, checkOut: string): number {
  const inDate = new Date(`${checkIn}T00:00:00Z`);
  const outDate = new Date(`${checkOut}T00:00:00Z`);
  const ms = outDate.getTime() - inDate.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function isValidDateRange(checkIn: string, checkOut: string): boolean {
  return nightsBetween(checkIn, checkOut) >= 1;
}

export function todayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}