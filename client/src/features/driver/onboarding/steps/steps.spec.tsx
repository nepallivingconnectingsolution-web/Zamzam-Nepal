import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";

vi.mock("@/api/client", async (orig) => {
  const actual = await orig<typeof import("@/api/client")>();
  return { ...actual, api: { ...actual.api, blob: vi.fn(() => Promise.resolve(new Blob(["x"]))) } };
});

import { LicenceStep } from "./LicenceStep";
import { VehicleStep } from "./VehicleStep";
import { DocumentsStep } from "./DocumentsStep";
import { ReviewStep } from "./ReviewStep";
import { PhoneStep } from "./PhoneStep";
import { ApplicationStatusPage } from "../ApplicationStatusPage";
import { bikeRequirements, carRequirements, doc, makeView, profile } from "../testFixtures";

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});

const noop = () => undefined;
const reject = () => Promise.reject(new Error("should not be called"));

describe("LicenceStep", () => {
  const props = (view = makeView()) => ({
    view, saveProfile: vi.fn(async () => view), upload: vi.fn(async () => view), removeUpload: vi.fn(async () => view),
    onBack: noop, onNext: vi.fn(),
  });

  it("shows the exact expired-licence message and will not save an expired licence", async () => {
    const user = userEvent.setup();
    const p = props(makeView({ profile: profile({ licenceExpiryDate: null }) }));
    render(<LicenceStep {...p} />);

    await user.type(screen.getByLabelText(/expiry date/i), "2020-01-01");

    const messages = screen.getAllByText("Your driving licence has expired. Please upload a valid licence.");
    expect(messages.length).toBeGreaterThan(0);
    const save = screen.getByRole("button", { name: /save & continue/i });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(p.saveProfile).not.toHaveBeenCalled();
  });

  it("asks for both licence photos before continuing", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<LicenceStep {...p} />);
    await user.click(screen.getByRole("button", { name: /save & continue/i }));
    expect(await screen.findByText("Upload both the front and the back of your licence.")).toBeInTheDocument();
    expect(p.saveProfile).not.toHaveBeenCalled();
  });

  it("saves the licence details and moves on when everything is filled in", async () => {
    const user = userEvent.setup();
    const reqs = bikeRequirements().map((r) => (r.docType.startsWith("licence_") ? { ...r, current: doc({ id: r.docType, fileId: `f_${r.docType}` }) } : r));
    const p = props(makeView({ requirements: reqs }));
    render(<LicenceStep {...p} />);
    await user.click(screen.getByRole("button", { name: /save & continue/i }));
    await waitFor(() => expect(p.saveProfile).toHaveBeenCalledOnce());
    expect(p.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ licenceNumber: "L-100", licenceExpiryDate: "2036-01-01" }));
    expect(p.onNext).toHaveBeenCalled();
  });

  it("keeps what was typed after a refresh (draft is restored)", async () => {
    const user = userEvent.setup();
    const p = props(makeView({ profile: profile({ licenceNumber: "" }) }));
    const first = render(<LicenceStep {...p} />);
    await user.type(screen.getByLabelText(/licence number/i), "NP-777");
    first.unmount();

    render(<LicenceStep {...p} />);
    expect(screen.getByLabelText(/licence number/i)).toHaveValue("NP-777");
  });
});

describe("VehicleStep", () => {
  const props = (view = makeView({ vehicle: null })) => ({
    view, saveVehicle: vi.fn(async () => view), onBack: noop, onNext: vi.fn(),
  });

  it("shows only bike fields for a bike, and body type and seats for a car", async () => {
    const user = userEvent.setup();
    render(<VehicleStep {...props()} />);
    await user.click(screen.getByRole("tab", { name: "Bike" }));
    expect(screen.queryByText("Body type")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Car" }));
    expect(screen.getByText("Body type")).toBeInTheDocument();
    expect(screen.getByText("Passenger seats")).toBeInTheDocument();
  });

  it("explains each problem inline, and a bad plate in particular", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<VehicleStep {...p} />);
    await user.type(screen.getByLabelText(/number plate/i), "1234");
    await user.click(screen.getByRole("button", { name: /save & continue/i }));
    expect(await screen.findByText("Choose Bike or Car.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid number plate, for example BA 99 PA 1234.")).toBeInTheDocument();
    expect(screen.getByText("Enter the vehicle make.")).toBeInTheDocument();
    expect(p.saveVehicle).not.toHaveBeenCalled();
  });

  it("formats the plate as it is typed", async () => {
    const user = userEvent.setup();
    render(<VehicleStep {...props()} />);
    const plate = screen.getByLabelText(/number plate/i);
    await user.type(plate, "ba99pa1234");
    expect(plate).toHaveValue("BA 99 PA 1234");
  });

  it("saves a valid bike", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<VehicleStep {...p} />);
    await user.click(screen.getByRole("tab", { name: "Bike" }));
    await user.type(screen.getByLabelText(/number plate/i), "BA1KHA1234");
    await user.type(screen.getByLabelText(/^make/i), "Bajaj");
    await user.type(screen.getByLabelText(/^model/i), "Pulsar 150");
    await user.type(screen.getByLabelText(/manufacturing year/i), "2020");
    await user.type(screen.getByLabelText(/^colour/i), "Black");
    await user.click(screen.getByRole("button", { name: /save & continue/i }));
    await waitFor(() => expect(p.saveVehicle).toHaveBeenCalledOnce());
    expect(p.saveVehicle).toHaveBeenCalledWith(expect.objectContaining({ category: "bike", plateNumber: "BA 1 KHA 1234", manufactureYear: 2020, make: "Bajaj" }));
    expect(p.onNext).toHaveBeenCalled();
  });

  it("puts a 'plate already registered' answer from the server under the plate field", async () => {
    const user = userEvent.setup();
    const message = "A vehicle with this number plate is already registered.";
    const p = props();
    p.saveVehicle = vi.fn(() => Promise.reject(new ApiError(409, message, { message, code: "PLATE_TAKEN" })));
    render(<VehicleStep {...p} />);
    await user.click(screen.getByRole("tab", { name: "Bike" }));
    await user.type(screen.getByLabelText(/number plate/i), "BA1KHA1234");
    await user.type(screen.getByLabelText(/^make/i), "Bajaj");
    await user.type(screen.getByLabelText(/^model/i), "Pulsar");
    await user.type(screen.getByLabelText(/manufacturing year/i), "2020");
    await user.type(screen.getByLabelText(/^colour/i), "Black");
    await user.click(screen.getByRole("button", { name: /save & continue/i }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(p.onNext).not.toHaveBeenCalled();
  });
});

describe("DocumentsStep", () => {
  const props = (view = makeView()) => ({ view, upload: vi.fn(async () => view), removeUpload: vi.fn(async () => view), onBack: noop, onNext: vi.fn() });

  it("lists bike items without road tax, and counts required uploads", () => {
    render(<DocumentsStep {...props()} />);
    expect(screen.getByText("Vehicle insurance")).toBeInTheDocument();
    expect(screen.queryByText("Road tax receipt")).not.toBeInTheDocument();
    expect(screen.queryByText("Licence", { exact: false })).not.toBeInTheDocument(); // licence has its own step
    expect(screen.getByText(/0 of 7/)).toBeInTheDocument(); // identity_front, bluebook, insurance, 4 photos
  });

  it("lists car items including road tax and the interior photo", () => {
    render(<DocumentsStep {...props(makeView({ requirements: carRequirements(), vehicle: { ...makeView().vehicle!, category: "car" } }))} />);
    expect(screen.getByText("Road tax receipt")).toBeInTheDocument();
    expect(screen.getByText("Interior photo")).toBeInTheDocument();
  });

  it("marks optional items as optional and required ones with a star", () => {
    render(<DocumentsStep {...props()} />);
    expect(screen.getByText("Citizenship or national ID (back)").parentElement).toHaveTextContent("Optional");
  });

  it("will not continue while a required item is missing, and says how many", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<DocumentsStep {...p} />);
    await user.click(screen.getByRole("button", { name: /save & continue/i }));
    expect(await screen.findByText("Upload the 7 required items still missing.")).toBeInTheDocument();
    expect(p.onNext).not.toHaveBeenCalled();
  });

  it("continues once every required item is uploaded", async () => {
    const user = userEvent.setup();
    const reqs = bikeRequirements().map((r, i) => (r.docType.startsWith("licence_") ? r : { ...r, current: r.isRequired ? doc({ id: `d${i}`, fileId: `f${i}` }) : null }));
    const p = props(makeView({ requirements: reqs }));
    render(<DocumentsStep {...p} />);
    expect(screen.getByText(/7 of 7/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save & continue/i }));
    expect(p.onNext).toHaveBeenCalled();
  });

  it("asks for the expiry date before letting insurance be uploaded", async () => {
    const user = userEvent.setup();
    render(<DocumentsStep {...props()} />);
    const insurance = screen.getByText("Vehicle insurance").closest("div.rounded-xl")!;
    await user.click(insurance.querySelector("button")!); // Upload
    expect(await screen.findByText("Enter the expiry date first.")).toBeInTheDocument();
  });
});

describe("ReviewStep", () => {
  const props = (view = makeView()) => ({ view, submit: vi.fn(async () => view), onBack: noop, onEdit: vi.fn(), onSubmitted: vi.fn() });

  it("only lets the driver submit after confirming the information is genuine", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<ReviewStep {...p} />);
    const submit = screen.getByRole("button", { name: /submit for verification/i });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(p.submit).toHaveBeenCalledOnce());
    expect(p.onSubmitted).toHaveBeenCalled();
  });

  it("lists what is still missing and cannot be submitted, each with a way to fix it", async () => {
    const user = userEvent.setup();
    const view = makeView({
      canSubmit: false,
      blockers: [
        { code: "DOCUMENT_MISSING", message: "Upload your vehicle insurance." },
        { code: "LICENCE_EXPIRED", message: "Your driving licence has expired. Please upload a valid licence." },
      ],
    });
    const p = props(view);
    render(<ReviewStep {...p} />);
    expect(screen.getByText("Upload your vehicle insurance.")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /submit for verification/i })).toBeDisabled();
    const fix = screen.getAllByRole("button", { name: "Fix" });
    await user.click(fix[0]);
    expect(p.onEdit).toHaveBeenCalledWith(4); // documents
    await user.click(fix[1]);
    expect(p.onEdit).toHaveBeenCalledWith(2); // licence
  });

  it("shows the server's reasons when submission is refused", async () => {
    const user = userEvent.setup();
    const view = makeView();
    const p = props(view);
    p.submit = vi.fn(() =>
      Promise.reject(new ApiError(400, "Upload your vehicle insurance.", { message: "Upload your vehicle insurance.", code: "SUBMIT_BLOCKED", details: [{ code: "DOCUMENT_MISSING", message: "Upload your vehicle insurance." }] })),
    );
    render(<ReviewStep {...p} />);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /submit for verification/i }));
    expect((await screen.findAllByText("Upload your vehicle insurance.")).length).toBeGreaterThan(0);
    expect(p.onSubmitted).not.toHaveBeenCalled();
  });
});

describe("PhoneStep", () => {
  it("sends a code, then verifies it", async () => {
    const user = userEvent.setup();
    const view = makeView({ profile: profile({ phoneVerifiedAt: null }) });
    const sendOtp = vi.fn(async () => ({ sentTo: "98*****678", expiresInSeconds: 300 }));
    const verifyOtp = vi.fn(async () => undefined);
    const onNext = vi.fn();
    render(<PhoneStep view={view} sendOtp={sendOtp} verifyOtp={verifyOtp} onNext={onNext} />);

    await user.click(screen.getByRole("button", { name: /send my code/i }));
    expect(await screen.findByText("98*****678")).toBeInTheDocument();

    const boxes = screen.getAllByRole("textbox");
    await user.click(boxes[0]);
    await user.keyboard("123456");
    await user.click(screen.getByRole("button", { name: /verify and continue/i }));
    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith("123456"));
    expect(onNext).toHaveBeenCalled();
  });

  it("shows a wrong-code error and lets the driver try again", async () => {
    const user = userEvent.setup();
    const view = makeView({ profile: profile({ phoneVerifiedAt: null }) });
    const verifyOtp = vi.fn(() => Promise.reject(new ApiError(400, "That code is invalid or has expired.", { message: "x" })));
    render(<PhoneStep view={view} sendOtp={async () => ({ sentTo: "98*****678", expiresInSeconds: 300 })} verifyOtp={verifyOtp} onNext={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /send my code/i }));
    await user.click((await screen.findAllByRole("textbox"))[0]);
    await user.keyboard("000000");
    await user.click(screen.getByRole("button", { name: /verify and continue/i }));
    expect(await screen.findByText("That code is invalid or has expired.")).toBeInTheDocument();
  });

  it("skips ahead when the phone is already verified", async () => {
    const onNext = vi.fn();
    render(<PhoneStep view={makeView()} sendOtp={reject} verifyOtp={reject} onNext={onNext} />);
    expect(screen.getByText("Phone number verified")).toBeInTheDocument();
  });
});

describe("ApplicationStatusPage", () => {
  const ob = () => ({ upload: vi.fn(async () => makeView()), removeUpload: vi.fn(async () => makeView()), submit: vi.fn(async () => makeView()), reopen: vi.fn(async () => makeView()) });
  const page = (view: ReturnType<typeof makeView>, o = ob(), extra: Record<string, unknown> = {}) =>
    render(
      <MemoryRouter>
        <ApplicationStatusPage ob={o} view={view} onEdit={vi.fn()} {...extra} />
      </MemoryRouter>,
    );

  it("tells a driver whose application is waiting that it is under review", () => {
    const reqs = bikeRequirements().map((r, i) => (r.isRequired ? { ...r, current: doc({ id: `d${i}`, fileId: `f${i}` }) } : r));
    page(makeView({ requirements: reqs, statusMessage: "Your application is under review." }, "UNDER_REVIEW"));
    expect(screen.getByText("Your application is under review.")).toBeInTheDocument();
    expect(screen.getAllByText("Waiting").length).toBeGreaterThan(0);
  });

  it("celebrates a fresh submission", () => {
    page(makeView({ statusMessage: "Your application is submitted and waiting for review." }, "SUBMITTED"), ob(), { justSubmitted: true });
    expect(screen.getByRole("heading", { name: "Application submitted" })).toBeInTheDocument();
  });

  it("shows a rejected document with the reviewer's reason and a way to upload a new one, without restarting", async () => {
    const user = userEvent.setup();
    const reqs = bikeRequirements().map((r, i) =>
      r.docType === "insurance"
        ? { ...r, current: doc({ id: "d_ins", fileId: "f_ins", status: "REJECTED", rejectionReason: "Insurance image is unclear." }) }
        : r.isRequired ? { ...r, current: doc({ id: `d${i}`, fileId: `f${i}`, status: "APPROVED" }) } : r,
    );
    const o = ob();
    page(
      makeView({
        requirements: reqs, canSubmit: false,
        blockers: [{ code: "DOCUMENT_REJECTED", message: "Replace the rejected vehicle insurance first." }],
        statusMessage: "Your vehicle insurance was rejected: Insurance image is unclear. Please upload a new one.",
      }, "RESUBMISSION_REQUIRED"),
      o,
    );
    expect(screen.getByRole("heading", { name: /Your vehicle insurance was rejected/ })).toBeInTheDocument();
    expect(screen.getByText("Reason: Insurance image is unclear.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /replace/i })).toBeInTheDocument();
    // only the flagged item is offered, not the whole application
    expect(screen.queryByText("Vehicle registration (bluebook)")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resubmit application/i })).toBeDisabled();
    expect(screen.getByText(/Before you can resubmit: Replace the rejected vehicle insurance first\./)).toBeInTheDocument();
    void user;
  });

  it("lets the driver resubmit once everything flagged has been replaced", async () => {
    const user = userEvent.setup();
    const o = ob();
    page(makeView({ canSubmit: true, statusMessage: "Some items need to be updated." }, "RESUBMISSION_REQUIRED"), o);
    await user.click(screen.getByRole("button", { name: /resubmit application/i }));
    await waitFor(() => expect(o.submit).toHaveBeenCalledOnce());
  });

  it("offers to update the licence when it has expired", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <MemoryRouter>
        <ApplicationStatusPage
          ob={ob()}
          view={makeView({ canSubmit: false, blockers: [{ code: "LICENCE_EXPIRED", message: "Your driving licence has expired. Please upload a valid licence." }], statusMessage: "A licence or document has expired. Upload a valid one to continue." }, "EXPIRED")}
          onEdit={onEdit}
        />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: /update licence/i }));
    expect(onEdit).toHaveBeenCalledWith(2);
  });

  it("lets a rejected applicant reopen and reapply", async () => {
    const user = userEvent.setup();
    const o = ob();
    page(makeView({ statusMessage: "Your application was rejected: Photos unclear." }, "REJECTED"), o);
    await user.click(screen.getByRole("button", { name: /update and apply again/i }));
    await waitFor(() => expect(o.reopen).toHaveBeenCalledOnce());
  });

  it("congratulates an approved driver and points to the dashboard", () => {
    page(makeView({ statusMessage: "Your ZamZam Driver account has been approved." }, "APPROVED"));
    expect(screen.getByText("Your ZamZam Driver account has been approved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open driver dashboard/i })).toBeInTheDocument();
  });

  it("explains a suspension without offering a way to go online", () => {
    page(makeView({ statusMessage: "Your account is suspended: Safety report." }, "SUSPENDED"));
    expect(screen.getByRole("heading", { name: /suspended/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dashboard/i })).not.toBeInTheDocument();
  });
});
