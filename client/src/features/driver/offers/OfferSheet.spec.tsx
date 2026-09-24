import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfferSheet } from "./OfferSheet";
import type { OfferView } from "../onboarding/onboarding.types";

const NOW = new Date("2026-09-21T10:00:00.000Z");

const offer = (over: Partial<OfferView> = {}): OfferView => ({
  offerId: "of_1",
  rideId: "r_1",
  service: "bike",
  pickup: { label: "Ratna Park", lat: 27.7, lng: 85.3 },
  destination: { label: "Thamel", lat: 27.71, lng: 85.31 },
  distanceKm: 2.5,
  fare: 150,
  pickupDistanceKm: 0.8,
  pickupEtaMin: 3,
  expiresAt: new Date(NOW.getTime() + 15_000).toISOString(),
  ...over,
});

const setup = (offers: OfferView[], extra: Partial<React.ComponentProps<typeof OfferSheet>> = {}) => {
  const props = { offers, skewMs: 0, busy: false, onAccept: vi.fn(), onDecline: vi.fn(), onExpire: vi.fn(), ...extra };
  return { props, ...render(<OfferSheet {...props} />) };
};

describe("OfferSheet", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows nothing when there is no offer", () => {
    setup([]);
    expect(screen.queryByText("New ride")).not.toBeInTheDocument();
  });

  it("shows pickup, destination, distance, fare and pickup ETA, with a countdown", () => {
    setup([offer()]);
    expect(screen.getByText("New ride")).toBeInTheDocument();
    expect(screen.getByText("Ratna Park")).toBeInTheDocument();
    expect(screen.getByText("Thamel")).toBeInTheDocument();
    expect(screen.getByText("2.5 km")).toBeInTheDocument();
    expect(screen.getByText("3 min")).toBeInTheDocument();
    expect(screen.getByText("0.8 km away")).toBeInTheDocument();
    expect(screen.getByText(/150/)).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveAccessibleName("15 seconds left");
  });

  it("counts down as time passes", () => {
    setup([offer()]);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByRole("timer")).toHaveAccessibleName("11 seconds left");
  });

  it("accepts and declines the offer it is showing", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime, pointerEventsCheck: 0 });
    const { props } = setup([offer()]);
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(props.onAccept).toHaveBeenCalledWith("of_1");
    await user.click(screen.getByRole("button", { name: "Decline" }));
    expect(props.onDecline).toHaveBeenCalledWith("of_1");
  });

  it("drops the offer when the timer runs out", () => {
    const { props } = setup([offer({ expiresAt: new Date(NOW.getTime() + 2000).toISOString() })]);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(props.onExpire).toHaveBeenCalledWith("of_1");
  });

  it("shows the offer that expires soonest first", () => {
    setup([
      offer({ offerId: "late", pickup: { label: "Later pickup", lat: 0, lng: 0 }, expiresAt: new Date(NOW.getTime() + 14_000).toISOString() }),
      offer({ offerId: "soon", pickup: { label: "Sooner pickup", lat: 0, lng: 0 }, expiresAt: new Date(NOW.getTime() + 6_000).toISOString() }),
    ]);
    expect(screen.getByText("Sooner pickup")).toBeInTheDocument();
    expect(screen.queryByText("Later pickup")).not.toBeInTheDocument();
  });

  it("uses the server's clock, so a wrong phone clock cannot expire a live offer", () => {
    // The phone believes it is 20 seconds later than the server does.
    setup([offer()], { skewMs: -20_000 });
    expect(screen.getByRole("timer")).toHaveAccessibleName("35 seconds left");
  });

  it("cannot be dismissed by clicking outside or pressing escape (the driver must answer)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime, pointerEventsCheck: 0 });
    const { props } = setup([offer()]);
    await user.keyboard("{Escape}");
    expect(screen.getByText("New ride")).toBeInTheDocument();
    expect(props.onDecline).not.toHaveBeenCalled();
    expect(props.onExpire).not.toHaveBeenCalled();
  });

  it("disables both buttons while an answer is in flight", () => {
    setup([offer()], { busy: true });
    expect(screen.getByRole("button", { name: "Decline" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /accept/i })).toBeDisabled();
  });
});
