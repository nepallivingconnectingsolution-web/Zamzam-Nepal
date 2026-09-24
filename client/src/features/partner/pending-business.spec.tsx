import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/api/client", async (orig) => {
  const actual = await orig<typeof import("@/api/client")>();
  return { ...actual, api: { ...actual.api, get: (...a: unknown[]) => get(...a) } };
});
// The documents list is its own screen with its own tests; here it is a marker.
vi.mock("@/features/partner/PartnerDocumentsPage", () => ({
  PartnerDocumentsPage: ({ partnerType, onboarding }: { partnerType: string; onboarding?: boolean }) => (
    <div>DOCUMENTS {partnerType} {onboarding ? "onboarding" : "portal"}</div>
  ),
}));

import { RequireRole } from "@/components/auth/RequireRole";
import { PartnerVerificationPage } from "./PartnerVerificationPage";
import { useAuthStore } from "@/stores/auth.store";
import type { Role, User } from "@/types";

const signIn = (role: Role, kycStatus: User["kycStatus"]) =>
  useAuthStore.getState().setSession("t", { id: "u_1", name: "Sita", mobile: "9800000000", email: "s@e.com", role, avatarUrl: null, kycStatus }, "r");

function app(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireRole role="hotel" />}>
          <Route path="/hotel" element={<div>HOTEL PORTAL</div>} />
        </Route>
        <Route element={<RequireRole role="driver" />}>
          <Route path="/driver" element={<div>DRIVER PORTAL</div>} />
        </Route>
        <Route path="/verification" element={<PartnerVerificationPage />} />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  get.mockReset();
  useAuthStore.getState().signOut();
});

describe("RequireRole and unapproved businesses", () => {
  it("sends a PENDING business to the verification screen instead of its portal", async () => {
    signIn("hotel", "PENDING");
    get.mockResolvedValue({ kycStatus: "PENDING", businessName: "Hotel Himal", businessAddress: "Pokhara", profileComplete: true });
    app("/hotel");
    expect(await screen.findByText("Verify your business")).toBeInTheDocument();
    expect(screen.queryByText("HOTEL PORTAL")).not.toBeInTheDocument();
  });

  it("lets an approved business into its portal", () => {
    signIn("hotel", "APPROVED");
    app("/hotel");
    expect(screen.getByText("HOTEL PORTAL")).toBeInTheDocument();
  });

  it("does not hold a PENDING driver back: drivers have their own onboarding gate", () => {
    signIn("driver", "PENDING");
    app("/driver");
    expect(screen.getByText("DRIVER PORTAL")).toBeInTheDocument();
  });
});

describe("verification screen", () => {
  it("shows the business details and the documents in onboarding mode", async () => {
    signIn("hotel", "PENDING");
    get.mockResolvedValue({ kycStatus: "PENDING", businessName: "Hotel Himal", businessAddress: "Pokhara", profileComplete: true });
    app("/verification");
    expect(await screen.findByText(/Hotel Himal, Pokhara/)).toBeInTheDocument();
    expect(screen.getByText("DOCUMENTS hotel onboarding")).toBeInTheDocument();
    expect(screen.getByText("Awaiting approval")).toBeInTheDocument();
  });

  it("asks for the business details when they haven't been filled in", async () => {
    signIn("hotel", "PENDING");
    get.mockResolvedValue({ kycStatus: "PENDING", businessName: null, businessAddress: null, profileComplete: false });
    app("/verification");
    expect(await screen.findByRole("button", { name: "Add details" })).toBeInTheDocument();
  });

  it("opens the portal by itself once the super admin approves", async () => {
    signIn("hotel", "PENDING");
    get.mockResolvedValue({ kycStatus: "APPROVED", businessName: "Hotel Himal", businessAddress: null, profileComplete: true });
    app("/verification");
    await waitFor(() => expect(screen.getByText("HOTEL PORTAL")).toBeInTheDocument());
    expect(useAuthStore.getState().user?.kycStatus).toBe("APPROVED");
  });

  it("tells a rejected business so, and offers no documents", async () => {
    signIn("hotel", "PENDING");
    get.mockResolvedValue({ kycStatus: "SUSPENDED", businessName: "Hotel Himal", businessAddress: null, profileComplete: true });
    app("/verification");
    expect(await screen.findByText("Your application wasn't approved")).toBeInTheDocument();
    expect(screen.queryByText(/DOCUMENTS/)).not.toBeInTheDocument();
  });

  it("sends signed-out visitors to login without calling the API", () => {
    app("/verification");
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it("sends an approved business or a driver to their own portal instead", () => {
    signIn("hotel", "APPROVED");
    const { unmount } = app("/verification");
    expect(screen.getByText("HOTEL PORTAL")).toBeInTheDocument();
    unmount();

    useAuthStore.getState().signOut();
    signIn("driver", "PENDING");
    app("/verification");
    expect(screen.getByText("DRIVER PORTAL")).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
});
