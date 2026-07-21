/**
 * Time/date helpers for the bus scheduling system. These intentionally
 * mirror the original mock engine's exact formats — "07:00 AM" 12-hour
 * strings, "YYYY-MM-DD" dates, "6h 30m" durations — because the frontend's
 * OperatorBusManager.tsx converts <input type="time"> values to this exact
 * 12-hour format before sending them, and renders these fields verbatim.
 */

/** Parse "07:00 AM" -> minutes since midnight. */
export function parse12Hour(t: string): number {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const isPM = m[3].toUpperCase() === 'PM';
  if (isPM && h !== 12) h += 12;
  if (!isPM && h === 12) h = 0;
  return h * 60 + parseInt(m[2], 10);
}

/** "07:00 AM" + "01:30 PM" -> "6h 30m" (wraps across midnight for overnight routes). */
export function durationBetween(departure: string, arrival: string): string {
  let mins = parse12Hour(arrival) - parse12Hour(departure);
  if (mins < 0) mins += 24 * 60;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/** Today as "YYYY-MM-DD" (UTC midnight — schedules are date-only, not timezone-sensitive). */
export function todayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" + n days -> "YYYY-MM-DD". */
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Day-of-week for a "YYYY-MM-DD" string: 0=Sun..6=Sat. */
export function dayOfWeek(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** Hours between now and a "YYYY-MM-DD" + "07:00 AM"-style departure. Negative once it's passed. */
export function hoursUntilDeparture(date: string, departure: string): number {
  const depMinutes = parse12Hour(departure);
  const dep = new Date(`${date}T00:00:00Z`);
  dep.setUTCMinutes(dep.getUTCMinutes() + depMinutes);
  return (dep.getTime() - Date.now()) / 36e5;
}

export type CancellationTier = 'FULL' | 'PARTIAL' | 'NONE';

export function computeCancellationPolicy(date: string, departure: string): { tier: CancellationTier; refundPercent: number } {
  const hours = hoursUntilDeparture(date, departure);
  if (hours >= 24) return { tier: 'FULL', refundPercent: 1 };
  if (hours >= 6) return { tier: 'PARTIAL', refundPercent: 0.5 };
  return { tier: 'NONE', refundPercent: 0 };
}