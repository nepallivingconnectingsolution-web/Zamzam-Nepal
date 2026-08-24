import { describe, expect, it } from "vitest";
import { buildSchedulePayload, computeMissingScheduleFields, plusDays, to12Hour } from "./schedule-form.utils";
import type { ScheduleFormState } from "./schedule-form.utils";

describe("to12Hour", () => {
  it("converts an empty string to an empty string", () => {
    expect(to12Hour("")).toBe("");
  });

  it("converts midnight to 12:00 AM", () => {
    expect(to12Hour("00:00")).toBe("12:00 AM");
  });

  it("converts noon to 12:00 PM", () => {
    expect(to12Hour("12:00")).toBe("12:00 PM");
  });

  it("converts a morning time", () => {
    expect(to12Hour("07:05")).toBe("07:05 AM");
  });

  it("converts an afternoon time", () => {
    expect(to12Hour("13:30")).toBe("01:30 PM");
  });

  it("converts the last minute of the day", () => {
    expect(to12Hour("23:59")).toBe("11:59 PM");
  });
});

describe("plusDays", () => {
  it("adds days within the same month", () => {
    expect(plusDays("2026-04-01", 7)).toBe("2026-04-08");
  });

  it("rolls over a month boundary", () => {
    expect(plusDays("2026-04-28", 5)).toBe("2026-05-03");
  });

  it("rolls over a year boundary", () => {
    expect(plusDays("2026-12-29", 5)).toBe("2027-01-03");
  });

});

function baseForm(overrides: Partial<ScheduleFormState> = {}): ScheduleFormState {
  return {
    busId: "bus_1",
    fromCity: "Kathmandu",
    toCity: "Pokhara",
    departureTime24: "07:00",
    arrivalTime24: "13:30",
    price: 1500,
    frequency: "once",
    onceDate: "2026-04-01",
    operatingDays: [],
    validFrom: "2026-04-01",
    validUntil: "",
    addReturn: false,
    ...overrides,
  };
}

describe("computeMissingScheduleFields", () => {
  it("is empty once every required field for a one-time schedule is filled", () => {
    expect(computeMissingScheduleFields(baseForm())).toEqual([]);
  });

  it("lists every unfilled field, in field order", () => {
    const missing = computeMissingScheduleFields(
      baseForm({ busId: "", fromCity: "", toCity: "", departureTime24: "", arrivalTime24: "", onceDate: "" }),
    );
    expect(missing).toEqual(["a bus", "departure city", "destination city", "departure time", "arrival time", "a date"]);
  });

  it("requires a date only for a one-time schedule", () => {
    expect(computeMissingScheduleFields(baseForm({ frequency: "once", onceDate: "" }))).toContain("a date");
    expect(computeMissingScheduleFields(baseForm({ frequency: "daily", onceDate: "" }))).not.toContain("a date");
  });

  it("requires at least one weekday only for a weekly schedule", () => {
    expect(
      computeMissingScheduleFields(baseForm({ frequency: "weekly", operatingDays: [] })),
    ).toContain("at least one weekday");
    expect(
      computeMissingScheduleFields(baseForm({ frequency: "weekly", operatingDays: [1] })),
    ).not.toContain("at least one weekday");
  });

  it("does not require a weekday list for a daily schedule", () => {
    expect(computeMissingScheduleFields(baseForm({ frequency: "daily", operatingDays: [] }))).toEqual([]);
  });
});

describe("buildSchedulePayload", () => {
  it("builds a once-schedule payload with onceDate and no weekly/range fields", () => {
    const payload = buildSchedulePayload(baseForm({ frequency: "once", onceDate: "2026-04-01" }), "Kathmandu", "Pokhara");
    expect(payload).toEqual({
      busId: "bus_1",
      fromCity: "Kathmandu",
      toCity: "Pokhara",
      departureTime: "07:00 AM",
      arrivalTime: "01:30 PM",
      price: 1500,
      frequency: "once",
      onceDate: "2026-04-01",
    });
  });

  it("builds a daily-schedule payload with validFrom/validUntil and no onceDate/operatingDays", () => {
    const payload = buildSchedulePayload(
      baseForm({ frequency: "daily", validFrom: "2026-04-01", validUntil: "2026-04-30" }),
      "Kathmandu",
      "Pokhara",
    );
    expect(payload).toMatchObject({ frequency: "daily", validFrom: "2026-04-01", validUntil: "2026-04-30" });
    expect(payload).not.toHaveProperty("onceDate");
    expect(payload).not.toHaveProperty("operatingDays");
  });

  it("builds a weekly-schedule payload with operatingDays and a validity range", () => {
    const payload = buildSchedulePayload(
      baseForm({ frequency: "weekly", operatingDays: [1, 3, 5], validFrom: "2026-04-01", validUntil: "" }),
      "Kathmandu",
      "Pokhara",
    );
    expect(payload).toMatchObject({ frequency: "weekly", operatingDays: [1, 3, 5], validFrom: "2026-04-01" });
    expect(payload.validUntil).toBeUndefined();
    expect(payload).not.toHaveProperty("onceDate");
  });

  it("uses the explicit fromCity/toCity, not the form's — the return-leg swap depends on this", () => {
    const payload = buildSchedulePayload(baseForm(), "Pokhara", "Kathmandu");
    expect(payload.fromCity).toBe("Pokhara");
    expect(payload.toCity).toBe("Kathmandu");
  });
});
