import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("@/api/client", async (orig) => {
  const actual = await orig<typeof import("@/api/client")>();
  return { ...actual, api: { ...actual.api, post: (...a: unknown[]) => post(...a) } };
});

import { VerifyAccountPage } from "./VerifyAccountPage";
import { useAuthStore } from "@/stores/auth.store";

function app(state?: { userId?: string; email?: string }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/verify-account", state }]}>
      <Routes>
        <Route path="/verify-account" element={<VerifyAccountPage />} />
        <Route path="/login" element={<div>LOGIN</div>} />
        <Route path="/profile/setup" element={<div>PROFILE SETUP</div>} />
        <Route path="/app" element={<div>CUSTOMER HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillOtp(code: string) {
  const group = screen.getByRole("group", { name: /one-time code/i });
  const first = group.querySelectorAll("input")[0];
  fireEvent.paste(first, { clipboardData: { getData: () => code } });
}

beforeEach(() => {
  post.mockReset();
  useAuthStore.getState().signOut();
});

describe("VerifyAccountPage", () => {
  it("redirects to /login when there is no pending verification in state", () => {
    app(undefined);
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
  });

  it("sends the email code and verifies it, then moves to the mobile step", async () => {
    post
      .mockResolvedValueOnce({ sentTo: "a***@t.l" }) // resend email
      .mockResolvedValueOnce({ verified: true, fullyVerified: false }); // verify email

    app({ userId: "u1", email: "anita@example.com" });
    expect(screen.getByText("Verify your email")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /send my code/i }));
    await waitFor(() => expect(screen.getByText(/a\*\*\*@t\.l/)).toBeInTheDocument());

    fillOtp("123456");
    await waitFor(() => expect(post).toHaveBeenCalledWith("/auth/verify-email", { userId: "u1", otp: "123456" }, { auth: false }));
    await waitFor(() => expect(screen.getByText("Verify your mobile number")).toBeInTheDocument());
  });

  it("logs the user in once the last verification returns tokens", async () => {
    post
      .mockResolvedValueOnce({ sentTo: "a***@t.l" }) // resend email
      .mockResolvedValueOnce({
        verified: true,
        fullyVerified: true,
        accessToken: "tok",
        refreshToken: "rtok",
        user: { id: "u1", name: "Anita", mobile: "9812345678", email: "anita@example.com", role: "customer", avatarUrl: null, kycStatus: "APPROVED" },
        profileComplete: true,
      });

    app({ userId: "u1", email: "anita@example.com" });
    fireEvent.click(screen.getByRole("button", { name: /send my code/i }));
    await waitFor(() => expect(screen.getByRole("group", { name: /one-time code/i })).toBeInTheDocument());

    fillOtp("654321");
    await waitFor(() => expect(useAuthStore.getState().user?.id).toBe("u1"));
    expect(screen.getByText("CUSTOMER HOME")).toBeInTheDocument();
  });

  it("shows an error and lets the user retry on a wrong code", async () => {
    const { ApiError } = await import("@/api/client");
    post
      .mockResolvedValueOnce({ sentTo: "a***@t.l" })
      .mockRejectedValueOnce(new ApiError(400, "That code is invalid or has expired."));

    app({ userId: "u1", email: "anita@example.com" });
    fireEvent.click(screen.getByRole("button", { name: /send my code/i }));
    await waitFor(() => expect(screen.getByRole("group", { name: /one-time code/i })).toBeInTheDocument());

    fillOtp("000000");
    await waitFor(() => expect(screen.getByText("That code is invalid or has expired.")).toBeInTheDocument());
  });
});
