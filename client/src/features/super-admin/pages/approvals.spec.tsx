import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saApi = vi.fn();
const saBlob = vi.fn(async () => new Blob(["x"]));

vi.mock("@/features/super-admin/useSuperAdminApi", async (orig) => {
  const actual = await orig<typeof import("@/features/super-admin/useSuperAdminApi")>();
  return { ...actual, useSuperAdminApi: () => ({ saApi, saBlob }) };
});

import { SuperAdminApprovals } from "./SuperAdminApprovals";
import { BusinessReview } from "./BusinessReview";
import { SuperAdminReview } from "./SuperAdminReview";
import { SuperAdminApiError } from "@/features/super-admin/useSuperAdminApi";
import { Toaster } from "@/components/ui/toaster";
import type { ApprovalItem, ApprovalList, ApprovalResolution } from "@/features/super-admin/approvals.types";

beforeEach(() => {
  saApi.mockReset();
});

const calls = (needle: string) => saApi.mock.calls.filter((c) => (c[0] as string).includes(needle));

/* ───────────────────────────── Inbox ────────────────────────────────────── */

const item = (over: Partial<ApprovalItem> = {}): ApprovalItem => ({
  userId: "u_1", name: "Sita Rai", role: "hotel", businessName: "Hotel Himal", mobile: "9812345678", email: "sita@example.com",
  submittedAt: "2026-09-20T08:00:00.000Z", status: "PENDING", stage: "IN_REVIEW", applicationId: null,
  documents: { uploaded: 3, pending: 2, approved: 1, rejected: 0 }, ...over,
});
const inbox = (items: ApprovalItem[]): ApprovalList => ({ items, counts: { PENDING: items.length, APPROVED: 7, REJECTED: 2 } });

describe("approvals inbox", () => {
  const mount = (path = "/x-admin/approvals") =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/x-admin/approvals" element={<SuperAdminApprovals />} />
          <Route path="/x-admin/approvals/:userId" element={<p>review page</p>} />
        </Routes>
      </MemoryRouter>,
    );

  it("lists drivers and businesses together, with role, document progress and stage", async () => {
    saApi.mockResolvedValue(
      inbox([
        item(),
        item({ userId: "u_2", name: "Ram Thapa", role: "driver", businessName: null, stage: "IN_REVIEW", applicationId: "app_1", documents: { uploaded: 6, pending: 6, approved: 0, rejected: 0 } }),
      ]),
    );
    mount();
    expect(await screen.findByText("Hotel Himal")).toBeInTheDocument();
    expect(screen.getByText("Ram Thapa")).toBeInTheDocument();
    expect(screen.getByText("Driver", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Hotel", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(/3 uploaded · 2 to review/)).toBeInTheDocument();
  });

  it("shows the count on each status tab", async () => {
    saApi.mockResolvedValue(inbox([item()]));
    mount();
    await screen.findByText("Hotel Himal");
    const tabs = screen.getByRole("tablist");
    expect(within(tabs).getByRole("tab", { name: /Pending/ })).toHaveTextContent("1");
    expect(within(tabs).getByRole("tab", { name: /Approved/ })).toHaveTextContent("7");
    expect(within(tabs).getByRole("tab", { name: /Rejected/ })).toHaveTextContent("2");
  });

  it("opens the single review page for a registration, driver or business", async () => {
    const user = userEvent.setup();
    saApi.mockResolvedValue(inbox([item()]));
    mount();
    await user.click(await screen.findByRole("link", { name: /Hotel Himal/ }));
    expect(await screen.findByText("review page")).toBeInTheDocument();
  });

  it("asks the server for the tab and type that were picked", async () => {
    const user = userEvent.setup();
    saApi.mockResolvedValue(inbox([item()]));
    mount();
    await screen.findByText("Hotel Himal");
    expect(calls("status=PENDING")).not.toHaveLength(0);

    await user.click(screen.getByRole("tab", { name: /Approved/ }));
    await waitFor(() => expect(calls("status=APPROVED")).not.toHaveLength(0));
    await user.click(screen.getByRole("button", { name: "Drivers" }));
    await waitFor(() => expect(calls("type=driver")).not.toHaveLength(0));
  });

  it("starts on drivers when opened from an old driver link (?type=driver)", async () => {
    saApi.mockResolvedValue(inbox([]));
    mount("/x-admin/approvals?type=driver");
    await waitFor(() => expect(calls("type=driver")).not.toHaveLength(0));
    expect(screen.getByRole("button", { name: "Drivers" })).toHaveAttribute("aria-pressed", "true");
  });

  it("explains an empty inbox", async () => {
    saApi.mockResolvedValue(inbox([]));
    mount();
    expect(await screen.findByText("No pending registrations")).toBeInTheDocument();
  });

  it("shows an error with a working retry", async () => {
    const user = userEvent.setup();
    saApi.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(inbox([item()]));
    mount();
    expect(await screen.findByText("Couldn't load this")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Hotel Himal")).toBeInTheDocument();
  });
});

/* ───────────────────────────── Business review ──────────────────────────── */

type Business = Extract<ApprovalResolution, { kind: "business" }>;
const doc = (over: Partial<Business["documents"][number]> = {}): Business["documents"][number] => ({
  id: "doc_1", type: "business_license", label: "Hotel operating licence", hint: "", required: true, status: "PENDING",
  fileUrl: "/uploads/partner-documents/a.pdf", fileName: "a.pdf", mimeType: "application/pdf", reviewNote: null,
  updatedAt: "2026-09-20T08:00:00.000Z", ...over,
});
const business = (over: Partial<Business> = {}): Business => ({
  kind: "business",
  user: { id: "u_1", name: "Sita Rai", email: "sita@example.com", mobile: "9812345678", role: "hotel", kycStatus: "PENDING", businessName: "Hotel Himal", businessAddress: "Pokhara", createdAt: "2026-09-19T08:00:00.000Z" },
  documents: [
    doc(),
    doc({ id: "doc_2", type: "owner_id", label: "Owner's ID" }),
    doc({ id: null, type: "property_ownership", label: "Property ownership / lease", status: "NOT_UPLOADED", fileUrl: null, fileName: null, mimeType: null, updatedAt: null }),
  ],
  gate: { ok: false, message: "Verify these documents before approving: Hotel operating licence, Owner's ID, Property ownership / lease.", blockers: ["a"], notUploaded: ["Property ownership / lease"] },
  ...over,
});

describe("business review", () => {
  const mount = (data: Business, onChanged = vi.fn()) =>
    render(
      <MemoryRouter initialEntries={["/x-admin/approvals/u_1"]}>
        <Routes>
          <Route path="/x-admin/approvals/u_1" element={<BusinessReview data={data} onChanged={onChanged} />} />
          <Route path="/x-admin/approvals" element={<p>inbox</p>} />
        </Routes>
        <Toaster />
      </MemoryRouter>,
    );

  it("shows the business details and every required document, including ones not uploaded yet", () => {
    mount(business());
    expect(screen.getByRole("heading", { name: "Hotel Himal" })).toBeInTheDocument();
    expect(screen.getByText("Pokhara")).toBeInTheDocument();
    expect(screen.getByText("sita@example.com")).toBeInTheDocument();
    expect(screen.getByText("Hotel operating licence")).toBeInTheDocument();
    expect(screen.getByText("Not uploaded")).toBeInTheDocument();
    expect(screen.getByText(/Missing: the business hasn't uploaded this yet/)).toBeInTheDocument();
  });

  it("will not approve the business until every required document is verified, and says what is left", () => {
    mount(business());
    expect(screen.getByRole("button", { name: /approve business/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Verify these documents before approving");
    expect(screen.getByText(/Still to be uploaded by the business: Property ownership \/ lease/)).toBeInTheDocument();
  });

  it("approves a single document without a reason, in the same page", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    saApi.mockResolvedValue({ ok: true });
    mount(business(), onChanged);
    const row = screen.getByText("Hotel operating licence").closest("li")!;
    await user.click(within(row).getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(calls("/partner-documents/doc_1/verify")).toHaveLength(1));
    expect(calls("/partner-documents/doc_1/verify")[0][1]).toMatchObject({ method: "PATCH", body: { status: "APPROVED" } });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("needs a reason to reject a document, and sends it as the review note", async () => {
    const user = userEvent.setup();
    saApi.mockResolvedValue({ ok: true });
    mount(business());
    const row = screen.getByText("Owner's ID").closest("li")!;
    await user.click(within(row).getByRole("button", { name: /reject/i }));

    const confirm = await screen.findByRole("button", { name: "Reject document" });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Image is unclear." }));
    await user.click(confirm);
    await waitFor(() => expect(calls("/partner-documents/doc_2/verify")).toHaveLength(1));
    expect(calls("/partner-documents/doc_2/verify")[0][1]).toMatchObject({ body: { status: "SUSPENDED", reviewNote: "Image is unclear." } });
  });

  it("approves the business after confirmation and returns to the inbox", async () => {
    const user = userEvent.setup();
    saApi.mockResolvedValue({ ok: true });
    mount(business({ gate: { ok: true, message: "Every required document is verified.", blockers: [], notUploaded: [] } }));
    await user.click(screen.getByRole("button", { name: /approve business/i }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^approve$/i }));
    await waitFor(() => expect(calls("/users/u_1/kyc")).toHaveLength(1));
    expect(calls("/users/u_1/kyc")[0][1]).toMatchObject({ method: "PATCH", body: { kycStatus: "APPROVED" } });
    expect(await screen.findByText("inbox")).toBeInTheDocument();
  });

  it("rejects the business after confirmation", async () => {
    const user = userEvent.setup();
    saApi.mockResolvedValue({ ok: true });
    mount(business());
    await user.click(screen.getByRole("button", { name: /reject business/i }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^reject$/i }));
    await waitFor(() => expect(calls("/users/u_1/kyc")).toHaveLength(1));
    expect(calls("/users/u_1/kyc")[0][1]).toMatchObject({ body: { kycStatus: "SUSPENDED" } });
  });

  it("shows the server's message when the server refuses the approval", async () => {
    const user = userEvent.setup();
    saApi.mockRejectedValue(new SuperAdminApiError(409, "Verify these documents before approving: Owner's ID.", "DOCUMENTS_NOT_VERIFIED"));
    mount(business({ gate: { ok: true, message: "", blockers: [], notUploaded: [] } }));
    await user.click(screen.getByRole("button", { name: /approve business/i }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^approve$/i }));
    expect(await screen.findByText("Verify these documents before approving: Owner's ID.")).toBeInTheDocument();
    expect(screen.queryByText("inbox")).not.toBeInTheDocument();
  });

  it("offers Suspend for an approved business", () => {
    const approved = business();
    approved.user.kycStatus = "APPROVED";
    mount(approved);
    expect(screen.getByRole("button", { name: /suspend business/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve business/i })).not.toBeInTheDocument();
  });

  it("offers approval again for a rejected business", () => {
    const rejected = business();
    rejected.user.kycStatus = "SUSPENDED";
    mount(rejected);
    expect(screen.getByRole("button", { name: /approve again/i })).toBeInTheDocument();
  });
});

/* ───────────────────────────── Review entry point ───────────────────────── */

describe("review page", () => {
  const mount = () =>
    render(
      <MemoryRouter initialEntries={["/x-admin/approvals/u_1"]}>
        <Routes><Route path="/x-admin/approvals/:userId" element={<SuperAdminReview />} /></Routes>
      </MemoryRouter>,
    );

  it("renders the business review for a business registration", async () => {
    saApi.mockResolvedValue(business());
    mount();
    expect(await screen.findByRole("heading", { name: "Hotel Himal" })).toBeInTheDocument();
    expect(calls("/super-admin/approvals/u_1")).toHaveLength(1);
  });

  it("hands a driver over to the full application review", async () => {
    saApi.mockImplementation(async (path: string) => {
      if (path === "/super-admin/approvals/u_1") return { kind: "driver", userId: "u_1", applicationId: "app_9", applicationStatus: "SUBMITTED", pendingVehicles: [] };
      if (path.endsWith("/start-review")) return {};
      throw new Error("down");
    });
    mount();
    await waitFor(() => expect(calls("/super-admin/driver-applications/app_9")).not.toHaveLength(0));
  });

  it("explains when the account has nothing to review", async () => {
    saApi.mockRejectedValue(new SuperAdminApiError(404, "Registration not found."));
    mount();
    expect(await screen.findByText("Nothing to review here")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /all approvals/i })).toHaveAttribute("href", "/x-admin/approvals");
  });
});
