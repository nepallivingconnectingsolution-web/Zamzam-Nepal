import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const saApi = vi.fn();
const saBlob = vi.fn(async () => new Blob(["x"]));

vi.mock("@/features/super-admin/useSuperAdminApi", async (orig) => {
  const actual = await orig<typeof import("@/features/super-admin/useSuperAdminApi")>();
  return { ...actual, useSuperAdminApi: () => ({ saApi, saBlob }) };
});

import { SuperAdminPartnerDocuments } from "./SuperAdminPartnerDocuments";
import type { PartnerRecord, RecordDocument } from "@/features/super-admin/approvals.types";

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});
beforeEach(() => {
  saApi.mockReset();
});

const calls = (needle: string) => saApi.mock.calls.filter((c) => (c[0] as string).includes(needle));

const doc = (over: Partial<RecordDocument> = {}): RecordDocument => ({
  id: "doc_1", source: "partner", label: "Hotel operating licence", group: null, status: "APPROVED",
  fileUrl: "/uploads/partner-documents/a.pdf", fileId: null, fileName: "a.pdf", mimeType: "application/pdf",
  uploadedAt: "2026-09-20T08:00:00.000Z", reviewNote: null, ...over,
});
const record = (over: Partial<PartnerRecord> = {}): PartnerRecord => ({
  userId: "u_1", name: "Sita Rai", role: "hotel", businessName: "Hotel Himal", businessAddress: "Pokhara", mobile: "9812345678",
  email: "sita@example.com", registeredAt: "2026-09-19T08:00:00.000Z", status: "APPROVED", stage: "APPROVED", applicationId: null,
  documents: [doc()], ...over,
});

const mount = () => render(<MemoryRouter><SuperAdminPartnerDocuments /></MemoryRouter>);

describe("partner documents record", () => {
  it("lists every partner with their document count and status", async () => {
    saApi.mockResolvedValue({
      items: [
        record(),
        record({ userId: "u_2", name: "Ram Thapa", role: "driver", businessName: null, stage: "IN_REVIEW", status: "PENDING", applicationId: "app_1", documents: [doc({ id: "a1", source: "application", fileId: "f1", fileUrl: null, status: "PENDING", label: "Licence front" })] }),
      ],
    });
    mount();
    expect(await screen.findByText("Hotel Himal")).toBeInTheDocument();
    expect(screen.getByText("Ram Thapa")).toBeInTheDocument();
    expect(screen.getByText(/1 document · registered/, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/1 document · 1 to review/)).toBeInTheDocument();
  });

  it("expands a partner to show their details, their documents and a link back to the review", async () => {
    const user = userEvent.setup();
    saApi.mockResolvedValue({ items: [record()] });
    mount();
    await user.click(await screen.findByRole("button", { name: /Hotel Himal/ }));
    expect(screen.getByText("Pokhara")).toBeInTheDocument();
    expect(screen.getByText("Hotel operating licence")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view file for hotel operating licence/i })).toHaveAttribute("href", expect.stringContaining("/uploads/partner-documents/a.pdf"));
    expect(screen.getByRole("link", { name: /open full review/i })).toHaveAttribute("href", "/x-admin/approvals/u_1");
  });

  it("points a pending partner at the review page to decide", async () => {
    const user = userEvent.setup();
    saApi.mockResolvedValue({ items: [record({ status: "PENDING", stage: "IN_REVIEW", documents: [doc({ status: "PENDING" })] })] });
    mount();
    await user.click(await screen.findByRole("button", { name: /Hotel Himal/ }));
    expect(screen.getByRole("link", { name: /open review to approve or reject/i })).toBeInTheDocument();
    // Business documents are decided on the review page, not here.
    expect(screen.queryByRole("button", { name: /approve hotel operating licence/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reject hotel operating licence/i })).not.toBeInTheDocument();
  });

  it("filters by status, type and search through the server", async () => {
    const user = userEvent.setup();
    saApi.mockResolvedValue({ items: [record()] });
    mount();
    await screen.findByText("Hotel Himal");
    await user.click(screen.getByRole("button", { name: "Approved" }));
    await waitFor(() => expect(calls("status=APPROVED")).not.toHaveLength(0));
    await user.click(screen.getByRole("button", { name: "Hotels" }));
    await waitFor(() => expect(calls("type=hotel")).not.toHaveLength(0));
    await user.type(screen.getByLabelText("Search partners"), "himal");
    await waitFor(() => expect(calls("q=himal")).not.toHaveLength(0), { timeout: 2000 });
  });

  it("lets an admin decide a driver's legacy identity document, then reloads", async () => {
    const user = userEvent.setup();
    const legacy = doc({ id: "leg_1", source: "driver_legacy", label: "Citizenship", status: "PENDING", group: "DRIVER" });
    saApi.mockImplementation(async (path: string) => (path.includes("/driver-documents/") ? { ok: true } : { items: [record({ role: "driver", businessName: null, documents: [legacy] })] }));
    mount();
    await user.click(await screen.findByRole("button", { name: /Sita Rai/ }));
    await user.click(screen.getByRole("button", { name: /approve citizenship/i }));
    await waitFor(() => expect(calls("/driver-documents/leg_1/verify")).toHaveLength(1));
    expect(calls("/driver-documents/leg_1/verify")[0][1]).toMatchObject({ method: "PATCH", body: { status: "APPROVED" } });
    await waitFor(() => expect(calls("/partner-records").length).toBeGreaterThan(1));
  });

  it("shows an empty state and an error with retry", async () => {
    const user = userEvent.setup();
    saApi.mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ items: [] });
    mount();
    expect(await screen.findByText("Couldn't load this")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("No partners match these filters")).toBeInTheDocument();
  });
});
