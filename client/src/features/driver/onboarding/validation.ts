/**
 * Client-side form checks for driver onboarding. They exist to give instant,
 * specific feedback; the server re-validates everything (never trust the
 * client), and these rules deliberately mirror the server's.
 */

export type FieldErrors<T extends string = string> = Partial<Record<T, string>>;

export const LICENCE_EXPIRED_MESSAGE = "Your driving licence has expired. Please upload a valid licence.";
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const NEPAL_PROVINCES = [
  "Koshi",
  "Madhesh",
  "Bagmati",
  "Gandaki",
  "Lumbini",
  "Karnali",
  "Sudurpashchim",
];

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ───────────────────────────── Plates ───────────────────────────────────── */

export const normalizePlate = (input: string) => (input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Same rule as the server (driver-onboarding/plate.util.ts): province letters,
// digits, series letters, digits. E.g. BA 99 PA 1234, BA 1 KHA 1234.
export const isValidNepalPlate = (normalized: string) => /^[A-Z]{1,3}\d{1,3}[A-Z]{1,4}\d{1,4}$/.test(normalized);

/** "ba99pa1234" -> "BA 99 PA 1234" while the driver types. */
export const formatPlate = (input: string) => normalizePlate(input).match(/[A-Z]+|\d+/g)?.join(" ") ?? "";

/* ───────────────────────────── Forms ────────────────────────────────────── */

export interface PersonalForm {
  legalName: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  city: string;
  province: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  language: string;
}

export function validatePersonal(v: PersonalForm, today = todayIso()): FieldErrors<keyof PersonalForm> {
  const e: FieldErrors<keyof PersonalForm> = {};
  if (v.legalName.trim().length < 2) e.legalName = "Enter your full legal name.";
  if (!v.dateOfBirth) e.dateOfBirth = "Enter your date of birth.";
  else {
    const [y, m, d] = today.split("-");
    if (v.dateOfBirth > `${Number(y) - 18}-${m}-${d}`) e.dateOfBirth = "You must be at least 18 years old to drive with ZamZam.";
  }
  if (v.address.trim().length < 3) e.address = "Enter your address.";
  if (v.city.trim().length < 2) e.city = "Enter your city.";
  if (!v.province.trim()) e.province = "Choose your province.";
  if (v.emergencyContactName.trim().length < 2) e.emergencyContactName = "Enter your emergency contact's name.";
  if (!/^[0-9]{7,15}$/.test(v.emergencyContactPhone.trim())) e.emergencyContactPhone = "Enter a valid phone number (digits only).";
  return e;
}

export interface LicenceForm {
  licenceNumber: string;
  licenceClass: string;
  licenceAuthority: string;
  licenceIssueDate: string;
  licenceExpiryDate: string;
}

export function validateLicence(v: LicenceForm, today = todayIso()): FieldErrors<keyof LicenceForm> {
  const e: FieldErrors<keyof LicenceForm> = {};
  if (v.licenceNumber.trim().length < 3) e.licenceNumber = "Enter your licence number.";
  if (!v.licenceClass.trim()) e.licenceClass = "Choose your licence category.";
  if (v.licenceAuthority.trim().length < 2) e.licenceAuthority = "Enter the issuing authority.";

  if (!v.licenceIssueDate) e.licenceIssueDate = "Enter the issue date.";
  else if (v.licenceIssueDate > today) e.licenceIssueDate = "The issue date can't be in the future.";

  if (!v.licenceExpiryDate) e.licenceExpiryDate = "Enter the expiry date.";
  else if (v.licenceExpiryDate <= today) e.licenceExpiryDate = LICENCE_EXPIRED_MESSAGE;
  else if (v.licenceIssueDate && v.licenceExpiryDate <= v.licenceIssueDate) {
    e.licenceExpiryDate = "The expiry date must be after the issue date.";
  }
  return e;
}

export interface VehicleForm {
  category: string;
  make: string;
  model: string;
  plateNumber: string;
  manufactureYear: string;
  registrationYear: string;
  color: string;
  fuelType: string;
  serviceClass: string;
  seats: string;
}

export function validateVehicle(v: VehicleForm, currentYear = new Date().getFullYear()): FieldErrors<keyof VehicleForm> {
  const e: FieldErrors<keyof VehicleForm> = {};
  if (v.category !== "bike" && v.category !== "car") e.category = "Choose Bike or Car.";
  if (v.make.trim().length < 2) e.make = "Enter the vehicle make.";
  if (!v.model.trim()) e.model = "Enter the vehicle model.";
  if (!isValidNepalPlate(normalizePlate(v.plateNumber))) e.plateNumber = "Enter a valid number plate, for example BA 99 PA 1234.";
  if (v.color.trim().length < 2) e.color = "Enter the vehicle colour.";

  const made = Number(v.manufactureYear);
  const okYear = (n: number) => Number.isInteger(n) && n >= 1990 && n <= currentYear + 1;
  if (!okYear(made)) e.manufactureYear = "Enter a valid manufacturing year.";

  if (v.registrationYear.trim()) {
    const reg = Number(v.registrationYear);
    if (!okYear(reg)) e.registrationYear = "Enter a valid registration year.";
    else if (okYear(made) && reg < made) e.registrationYear = "Registration can't be earlier than the year it was made.";
  }
  if (v.category === "car" && !v.serviceClass.trim()) e.serviceClass = "Choose the body type.";
  return e;
}

/* ───────────────────────────── Files ────────────────────────────────────── */

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export interface FileCheckOptions {
  imagesOnly?: boolean;
  /** Minimum width and height in pixels (profile photo). */
  minSize?: number;
  /** Injected in tests; defaults to decoding the image in the browser. */
  measure?: (file: File) => Promise<{ width: number; height: number }>;
}

async function measureInBrowser(file: File) {
  const bmp = await createImageBitmap(file);
  const size = { width: bmp.width, height: bmp.height };
  bmp.close?.();
  return size;
}

/** Returns a friendly error message, or null when the file is fine to upload. */
export async function validateFile(file: File, opts: FileCheckOptions): Promise<string | null> {
  if (!ALLOWED_TYPES.includes(file.type)) return "Only JPG, PNG, WEBP or PDF files up to 5 MB are allowed.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_FILE_BYTES) return "That file is bigger than 5 MB. Choose a smaller one.";
  if (opts.imagesOnly && file.type === "application/pdf") return "Please upload a photo (JPG, PNG or WEBP).";

  if (opts.minSize && file.type.startsWith("image/")) {
    try {
      const { width, height } = await (opts.measure ?? measureInBrowser)(file);
      if (width < opts.minSize || height < opts.minSize) {
        return `This photo is too small. Use one at least ${opts.minSize} x ${opts.minSize} pixels.`;
      }
    } catch {
      // Can't decode it here; the server still checks the file, so don't block the upload.
    }
  }
  return null;
}
