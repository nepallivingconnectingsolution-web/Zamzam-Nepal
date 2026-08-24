/** Pure logic for the "Publish a schedule" form — kept independent of React so it's directly testable. */
import type { ScheduleFrequency } from "./types";

export interface ScheduleFormState {
  busId: string;
  fromCity: string;
  toCity: string;
  departureTime24: string; // "HH:MM", from <input type="time">
  arrivalTime24: string;
  price: number;
  frequency: ScheduleFrequency;
  onceDate: string;
  operatingDays: number[];
  validFrom: string;
  validUntil: string;
  addReturn: boolean; // also publish the reverse leg right away
}

/** Native <input type="time"> gives "HH:MM" (24h). Backend wants "07:00 AM" (12h). */
export function to12Hour(hhmm: string): string {
  if (!hhmm) return "";
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${mStr} ${period}`;
}

/**
 * "YYYY-MM-DD" + n days -> "YYYY-MM-DD", for the 1-week / 1-month quick-fill
 * buttons. UTC-anchored end to end (mirrors the server's addDaysIso) — a
 * local-time parse followed by a UTC serialize would silently shift the
 * result by a day in any timezone ahead of UTC, which includes Nepal
 * (UTC+5:45), this app's whole audience.
 */
export function plusDays(dateIso: string, n: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * What's still missing before the form can submit, in the order the fields
 * appear — shown as "Still needed: a bus, departure city, …" next to the
 * submit button so filling in every visible field and still being unable to
 * submit (because "Just this once" needs a date further down) doesn't leave
 * the person guessing why.
 */
export function computeMissingScheduleFields(form: ScheduleFormState): string[] {
  return [
    !form.busId && "a bus",
    !form.fromCity.trim() && "departure city",
    !form.toCity.trim() && "destination city",
    !form.departureTime24 && "departure time",
    !form.arrivalTime24 && "arrival time",
    form.frequency === "once" && !form.onceDate && "a date",
    form.frequency === "weekly" && form.operatingDays.length === 0 && "at least one weekday",
  ].filter((x): x is string => Boolean(x));
}

/** The POST body for one leg of a schedule — fromCity/toCity are explicit params so the "also publish the return journey" checkbox can reuse this with them swapped. */
export function buildSchedulePayload(form: ScheduleFormState, fromCity: string, toCity: string) {
  return {
    busId: form.busId,
    fromCity,
    toCity,
    departureTime: to12Hour(form.departureTime24),
    arrivalTime: to12Hour(form.arrivalTime24),
    price: Number(form.price),
    frequency: form.frequency,
    ...(form.frequency === "once" ? { onceDate: form.onceDate } : {}),
    ...(form.frequency === "weekly" ? { operatingDays: form.operatingDays } : {}),
    ...(form.frequency !== "once" ? { validFrom: form.validFrom, validUntil: form.validUntil || undefined } : {}),
  };
}
