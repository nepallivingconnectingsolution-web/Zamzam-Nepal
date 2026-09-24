import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/api/client", async (orig) => {
  const actual = await orig<typeof import("@/api/client")>();
  return { ...actual, api: { ...actual.api, get: (...a: unknown[]) => get(...a) } };
});

import { RequireApprovedDriver } from "./RequireApprovedDriver";

function mount() {
  return render(
    <MemoryRouter initialEntries={["/driver"]}>
      <Routes>
        <Route path="/driver" element={<RequireApprovedDriver />}>
          <Route index element={<div>DRIVER PORTAL</div>} />
        </Route>
        <Route path="/driver/onboarding" element={<div>YOUR APPLICATION</div>} />
      </Routes>
      <Outlet />
    </MemoryRouter>,
  );
}

const asStatus = (status: string) => get.mockResolvedValue({ application: { status } });

describe("RequireApprovedDriver", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("lets an approved driver into the portal", async () => {
    asStatus("APPROVED");
    mount();
    expect(await screen.findByText("DRIVER PORTAL")).toBeInTheDocument();
  });

  it.each(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "RESUBMISSION_REQUIRED", "REJECTED", "SUSPENDED", "EXPIRED"])(
    "sends a driver whose application is %s to their application, not the portal",
    async (status) => {
      asStatus(status);
      mount();
      expect(await screen.findByText("YOUR APPLICATION")).toBeInTheDocument();
      expect(screen.queryByText("DRIVER PORTAL")).not.toBeInTheDocument();
    },
  );

  it("shows a spinner, never a blank screen, while it checks", () => {
    get.mockReturnValue(new Promise(() => undefined));
    mount();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("does not let anyone in when the check fails, and offers a retry", async () => {
    const user = userEvent.setup();
    get.mockRejectedValueOnce(new Error("offline"));
    mount();
    expect(await screen.findByText("Couldn't load this")).toBeInTheDocument();
    expect(screen.queryByText("DRIVER PORTAL")).not.toBeInTheDocument();

    asStatus("APPROVED");
    await user.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.getByText("DRIVER PORTAL")).toBeInTheDocument());
  });
});
