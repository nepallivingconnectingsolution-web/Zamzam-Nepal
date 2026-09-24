import type { ApplicationView, CurrentDoc, DriverProfile, Requirement } from "./onboarding.types";

/** Test-only builders for the server's application view. */

const req = (docType: string, over: Partial<Requirement> = {}): Requirement => ({
  id: `req_${docType}`,
  docType,
  kind: "DOCUMENT",
  label: docType.replace(/[:_]/g, " "),
  isRequired: true,
  requiresExpiry: false,
  subject: "VEHICLE",
  sortOrder: 0,
  current: null,
  ...over,
});

export const doc = (over: Partial<CurrentDoc> = {}): CurrentDoc => ({
  id: "adoc_1",
  status: "PENDING",
  rejectionReason: null,
  expiryDate: null,
  fileId: "file_1",
  originalName: "scan.jpg",
  mimeType: "image/jpeg",
  uploadedAt: "2026-09-21T10:00:00.000Z",
  ...over,
});

export const bikeRequirements = (): Requirement[] => [
  req("licence_front", { subject: "DRIVER", label: "driving licence (front)" }),
  req("licence_back", { subject: "DRIVER", label: "driving licence (back)" }),
  req("identity_front", { subject: "DRIVER", label: "citizenship or national ID (front)" }),
  req("identity_back", { subject: "DRIVER", label: "citizenship or national ID (back)", isRequired: false }),
  req("bluebook", { label: "vehicle registration (bluebook)" }),
  req("insurance", { label: "vehicle insurance", requiresExpiry: true }),
  req("photo:front", { kind: "PHOTO", label: "front photo" }),
  req("photo:side", { kind: "PHOTO", label: "side photo" }),
  req("photo:rear", { kind: "PHOTO", label: "rear photo" }),
  req("photo:plate", { kind: "PHOTO", label: "number plate photo" }),
];

export const carRequirements = (): Requirement[] => [
  ...bikeRequirements().filter((r) => !r.docType.startsWith("photo:") || r.docType === "photo:front" || r.docType === "photo:rear" || r.docType === "photo:plate"),
  req("road_tax", { label: "road tax receipt", requiresExpiry: true }),
  req("photo:left", { kind: "PHOTO", label: "left side photo" }),
  req("photo:right", { kind: "PHOTO", label: "right side photo" }),
  req("photo:interior", { kind: "PHOTO", label: "interior photo" }),
];

export const profile = (over: Partial<DriverProfile> = {}): DriverProfile => ({
  userId: "u1",
  legalName: "Ram Thapa",
  photoFileId: "file_photo",
  dateOfBirth: "1995-02-01",
  gender: "male",
  address: "Baneshwor",
  city: "Kathmandu",
  province: "Bagmati",
  emergencyContactName: "Sita Thapa",
  emergencyContactPhone: "9800000000",
  language: "ne",
  licenceNumber: "L-100",
  licenceClass: "A",
  licenceAuthority: "DoTM Kathmandu",
  licenceIssueDate: "2020-01-01",
  licenceExpiryDate: "2036-01-01",
  phoneVerifiedAt: "2026-09-21T09:00:00.000Z",
  ...over,
});

export function makeView(over: Partial<ApplicationView> = {}, status: ApplicationView["application"]["status"] = "DRAFT"): ApplicationView {
  return {
    application: {
      id: "app_1", status, currentStep: 1, version: 0, rejectionReason: null,
      suspensionReason: null, submittedAt: null, isLegacy: false,
    },
    profile: profile(),
    vehicle: {
      id: "veh_1", category: "bike", plateNumber: "BA 1 KHA 1234", make: "Bajaj", model: "Pulsar 150",
      manufactureYear: 2020, registrationYear: 2020, color: "Black", fuelType: "petrol", serviceClass: null,
      seats: 1, verificationStatus: "PENDING",
    },
    requirements: bikeRequirements(),
    blockers: [],
    canSubmit: true,
    statusMessage: "Finish your application to start driving with ZamZam.",
    ...over,
  };
}
