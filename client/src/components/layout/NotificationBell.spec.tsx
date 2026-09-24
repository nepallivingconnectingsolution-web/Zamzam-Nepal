import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/api/client", async (orig) => {
  const actual = await orig<typeof import("@/api/client")>();
  return { ...actual, api: { ...actual.api, get: (...a: unknown[]) => get(...a), post: vi.fn() } };
});

import { NotificationBell } from "./NotificationBell";

const item = (id: string, type: string, title: string) => ({
  id, type, title, message: `${title} message`, entityType: null, entityId: null, isRead: false, createdAt: new Date().toISOString(),
});

describe("NotificationBell", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("renders driver onboarding and ride-offer notifications, and survives a type it has no icon for", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({
      items: [
        item("1", "driver_application", "Application approved"),
        item("2", "ride_offer", "New ride request"),
        item("3", "some_future_type", "Something new"),
      ],
      total: 3, unread: 3, limit: 8, offset: 0,
    });
    render(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Application approved")).toBeInTheDocument();
    expect(screen.getByText("New ride request")).toBeInTheDocument();
    expect(screen.getByText("Something new")).toBeInTheDocument();
  });
});
