import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const saApi = vi.fn();
const saBlob = vi.fn(async () => new Blob(["x"]));

vi.mock("@/features/super-admin/useSuperAdminApi", async (orig) => {
  const actual = await orig<typeof import("@/features/super-admin/useSuperAdminApi")>();
  return { ...actual, useSuperAdminApi: () => ({ saApi, saBlob }) };
});

import { DriverReview } from "./DriverReview";
import { SuperAdminApiError } from "@/features/super-admin/useSuperAdminApi";
import { Toaster } from "@/components/ui/toaster";
import type { ApplicationDetail } from "@/features/super-admin/applications.types";
import type { PendingVehicle } from "@/features/super-admin/approvals.types";

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});

function route(path: string, handler: (init?: { method?: string; body?: unknown }) => unknown) {
  return { path, handler };
}
function serve(routes: ReturnType<typeof route>[]) {
  saApi.mockImplementation(async (path: string, init?: { method?: string; body?: unknown }) => {
    const hit = routes.find((r) => path.startsWith(r.path));
    if (!hit) throw new Error(`unexpected request ${path}`);
    const out = hit.handler(init);
    if (out instanceof Error) throw out;
    return out;
  });
}

beforeEach(() => {
  saApi.mockReset();
  saBlob.mockClear();
});

/* ───────────────────────────── Detail ───────────────────────────────────── */

const doc = (over: Record<string, unknown> = {}) => ({
  id: "adoc_1", status: "PENDING", rejectionReason: null, expiryDate: null, fileId: "file_1", originalName: "scan.jpg",
  mimeType: "image/jpeg", uploadedAt: "2026-09-20T08:00:00.000Z", reviewedBy: null, reviewedAt: null, ...over,
});
const requirement = (docType: string, label: string, over: Record<string, unknown> = {}) => ({
  id: `req_${docType}`, docType, kind: "DOCUMENT", label, isRequired: true, requiresExpiry: false, subject: "VEHICLE",
  current: doc({ id: `adoc_${docType}`, fileId: `file_${docType}` }), history: [], ...over,
});

function detail(over: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return {
    application: { id: "app_1", status: "UNDER_REVIEW", version: 4, currentStep: 6, isLegacy: false, submittedAt: "2026-09-20T08:00:00.000Z", reviewedAt: null, reviewedBy: null, rejectionReason: null, suspensionReason: null },
    driver: { id: "u_abc", name: "Ram", email: "ram@example.com", mobile: "9812345678", kycStatus: "PENDING" },
    profile: {
      userId: "u_abc", legalName: "Ram Thapa", photoFileId: "file_photo", dateOfBirth: "1995-02-01", gender: "male", address: "Baneshwor",
      city: "Kathmandu", province: "Bagmati", emergencyContactName: "Sita", emergencyContactPhone: "9800000000", language: "ne",
      licenceNumber: "L-100", licenceClass: "A", licenceAuthority: "DoTM", licenceIssueDate: "2020-01-01", licenceExpiryDate: "2036-01-01",
      phoneVerifiedAt: "2026-09-19T08:00:00.000Z",
    },
    vehicle: { id: "veh_1", category: "bike", plateNumber: "BA 1 KHA 1234", make: "Bajaj", model: "Pulsar", manufactureYear: 2020, registrationYear: 2020, color: "Black", fuelType: "petrol", serviceClass: null, seats: 1, verificationStatus: "PENDING" },
    requirements: [
      requirement("licence_front", "driving licence (front)", { subject: "DRIVER" }),
      requirement("bluebook", "vehicle registration (bluebook)"),
      requirement("insurance", "vehicle insurance"),
    ] as never,
    missing: [], timeline: [], notes: [],
    approvalGate: { ok: false, message: "Application cannot be approved because 3 required documents are still pending.", blockers: [] },
    ...over,
  };
}

describe("driver review", () => {
  const mount = (d: ApplicationDetail, extra: { pendingVehicles?: PendingVehicle[]; onChanged?: () => void } = {}) => {
    serve([
      route("/super-admin/driver-applications/app_1/start-review", () => ({ status: "UNDER_REVIEW" })),
      route("/super-admin/driver-applications/documents/", () => ({ ok: true })),
      route("/super-admin/driver-applications/app_1/approve", () => ({ ok: true })),
      route("/super-admin/driver-applications/app_1", () => d),
    ]);
    return render(
      <MemoryRouter>
        <DriverReview applicationId="app_1" {...extra} />
      </MemoryRouter>,
    );
  };
  const calls = (needle: string) => saApi.mock.calls.filter((c) => (c[0] as string).includes(needle));

  it("starts the review when opened, and shows every section in one place", async () => {
    mount(detail());
    expect(await screen.findByRole("heading", { name: "Ram Thapa" })).toBeInTheDocument();
    await waitFor(() => expect(calls("/start-review")).toHaveLength(1));
    for (const title of ["1. Driver profile", "2. Driving licence", "3. Identity information", "4. Vehicle information", "5. Vehicle documents", "6. Vehicle photos", "7. Verification history", "8. Admin notes", "9. Application timeline"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText("BA 1 KHA 1234")).toBeInTheDocument();
  });

  it("will not let the application be approved while documents are pending, and says why", async () => {
    mount(detail());
    await screen.findByRole("heading", { name: "Ram Thapa" });
    expect(screen.getByText("Application cannot be approved because 3 required documents are still pending.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve application/i })).toBeDisabled();
  });

  it("enables approval once the gate passes, asks for confirmation, and sends the version it was looking at", async () => {
    const user = userEvent.setup();
    mount(detail({ approvalGate: { ok: true, message: "", blockers: [] } }));
    await screen.findByRole("heading", { name: "Ram Thapa" });
    await user.click(screen.getByRole("button", { name: /approve application/i }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^approve$/i }));
    await waitFor(() => expect(calls("/app_1/approve")).toHaveLength(1));
    expect(calls("/app_1/approve")[0][1]).toMatchObject({ method: "POST", body: { expectedVersion: 4 } });
  });

  it("approves a single document without a reason", async () => {
    const user = userEvent.setup();
    mount(detail());
    await screen.findByRole("heading", { name: "Ram Thapa" });
    const row = screen.getByText("Vehicle insurance").closest("li")!;
    await user.click(within(row).getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(calls("/documents/adoc_insurance/approve")).toHaveLength(1));
    expect(calls("/documents/adoc_insurance/approve")[0][1]).toMatchObject({ method: "PATCH" });
  });

  it("will not reject a document without a reason", async () => {
    const user = userEvent.setup();
    mount(detail());
    await screen.findByRole("heading", { name: "Ram Thapa" });
    const row = screen.getByText("Vehicle insurance").closest("li")!;
    await user.click(within(row).getByRole("button", { name: /reject/i }));

    const confirm = await screen.findByRole("button", { name: "Reject document" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/^reason/i), "ab");
    expect(confirm).toBeDisabled();
    expect(await screen.findByText("Give a reason so the driver knows what to fix.")).toBeInTheDocument();
    expect(calls("/reject")).toHaveLength(0);
  });

  it("rejects a document with a typed reason, or a quick reason chip", async () => {
    const user = userEvent.setup();
    mount(detail());
    await screen.findByRole("heading", { name: "Ram Thapa" });
    const row = screen.getByText("Vehicle insurance").closest("li")!;
    await user.click(within(row).getByRole("button", { name: /reject/i }));
    await user.click(await screen.findByRole("button", { name: "The document has expired." }));
    await user.click(screen.getByRole("button", { name: "Reject document" }));
    await waitFor(() => expect(calls("/documents/adoc_insurance/reject")).toHaveLength(1));
    expect(calls("/documents/adoc_insurance/reject")[0][1]).toMatchObject({ method: "PATCH", body: { reason: "The document has expired." } });
  });

  it("shows a missing required document, with no approve button for it", async () => {
    const d = detail();
    (d.requirements as unknown as { current: unknown }[])[2].current = null;
    d.missing = ["vehicle insurance"];
    mount(d);
    await screen.findByRole("heading", { name: "Ram Thapa" });
    expect(screen.getAllByText("MISSING").length).toBeGreaterThan(0);
    expect(screen.getByText("Missing: vehicle insurance")).toBeInTheDocument();
    const row = screen.getByText("Vehicle insurance").closest("li")!;
    expect(within(row).queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("shows earlier uploads with what was decided, in the verification history", async () => {
    const d = detail();
    (d.requirements as unknown as { history: unknown[] }[])[2].history = [doc({ id: "old", status: "REJECTED", rejectionReason: "Image is unclear." })];
    mount(d);
    await screen.findByRole("heading", { name: "Ram Thapa" });
    expect(screen.getByText("Reason: Image is unclear.")).toBeInTheDocument();
  });

  it("offers suspension for an approved driver, with a required reason", async () => {
    const user = userEvent.setup();
    mount(detail({ application: { ...detail().application, status: "APPROVED" }, approvalGate: { ok: true, message: "", blockers: [] } }));
    await screen.findByRole("heading", { name: "Ram Thapa" });
    expect(screen.queryByRole("button", { name: /approve application/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /suspend/i }));
    expect(within(await screen.findByRole("dialog")).getByRole("button", { name: "Suspend" })).toBeDisabled();
  });

  it("offers reactivation for a suspended driver", async () => {
    mount(detail({ application: { ...detail().application, status: "SUSPENDED", suspensionReason: "Safety report" } }));
    await screen.findByRole("heading", { name: "Ram Thapa" });
    expect(screen.getByRole("button", { name: /reactivate/i })).toBeInTheDocument();
    expect(screen.getByText("Suspended: Safety report")).toBeInTheDocument();
  });

  it("shows the server's message and reloads when the action fails (someone else acted first)", async () => {
    const user = userEvent.setup();
    let detailCalls = 0;
    saApi.mockImplementation(async (path: string) => {
      if (path.endsWith("/start-review")) return { status: "UNDER_REVIEW" };
      if (path.includes("/approve")) throw new SuperAdminApiError(409, "This application was updated by someone else. Reload and try again.", "STALE");
      detailCalls += 1;
      return detail({ approvalGate: { ok: true, message: "", blockers: [] } });
    });
    render(
      <MemoryRouter>
        <DriverReview applicationId="app_1" />
        <Toaster />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Ram Thapa" });
    const before = detailCalls;
    await user.click(screen.getByRole("button", { name: /approve application/i }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^approve$/i }));
    expect(await screen.findByText("This application was updated by someone else. Reload and try again.")).toBeInTheDocument();
    await waitFor(() => expect(detailCalls).toBeGreaterThan(before));
  });

  it("shows an error with retry when the application can't be loaded", async () => {
    saApi.mockImplementation(async (path: string) => {
      if (path.endsWith("/start-review")) return {};
      throw new Error("down");
    });
    render(
      <MemoryRouter>
        <DriverReview applicationId="app_1" />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Couldn't load this")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    void act;
  });
  it("links back to the approvals inbox", async () => {
    mount(detail());
    await screen.findByRole("heading", { name: "Ram Thapa" });
    expect(screen.getByRole("link", { name: /all approvals/i })).toHaveAttribute("href", "/x-admin/approvals");
  });

  it("lets the reviewer approve a vehicle the driver changed after approval, and tells the parent", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const pv: PendingVehicle = { id: "veh_2", category: "bike", makeModel: "Honda Shine", plateNumber: "BA 9 PA 1", verificationStatus: "PENDING" };
    serve([
      route("/super-admin/driver-applications/app_1/start-review", () => ({})),
      route("/super-admin/vehicles/veh_2/verify", () => ({ ok: true })),
      route("/super-admin/driver-applications/app_1", () => detail({ application: { ...detail().application, status: "APPROVED" } })),
    ]);
    render(<MemoryRouter><DriverReview applicationId="app_1" pendingVehicles={[pv]} onChanged={onChanged} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Vehicles awaiting approval" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /approve vehicle/i }));
    await waitFor(() => expect(calls("/vehicles/veh_2/verify")).toHaveLength(1));
    expect(calls("/vehicles/veh_2/verify")[0][1]).toMatchObject({ method: "PATCH", body: { status: "APPROVED" } });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("does not show the vehicle card while the application itself is still under review", async () => {
    const pv: PendingVehicle = { id: "veh_2", category: "bike", makeModel: "Honda Shine", plateNumber: "BA 9 PA 1", verificationStatus: "PENDING" };
    mount(detail(), { pendingVehicles: [pv] });
    await screen.findByRole("heading", { name: "Ram Thapa" });
    expect(screen.queryByRole("heading", { name: "Vehicles awaiting approval" })).not.toBeInTheDocument();
  });
});
