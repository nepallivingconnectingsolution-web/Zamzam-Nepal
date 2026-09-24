import { describe, expect, it } from "vitest";
import {
  LICENCE_EXPIRED_MESSAGE,
  formatPlate,
  isValidNepalPlate,
  normalizePlate,
  validateFile,
  validateLicence,
  validatePersonal,
  validateVehicle,
} from "./validation";

const TODAY = "2026-09-21";

const personal = {
  legalName: "Ram Thapa", dateOfBirth: "1995-02-01", gender: "male", address: "Baneshwor", city: "Kathmandu",
  province: "Bagmati", emergencyContactName: "Sita Thapa", emergencyContactPhone: "9800000000", language: "ne",
};
const licence = {
  licenceNumber: "L-100", licenceClass: "A", licenceAuthority: "DoTM Kathmandu",
  licenceIssueDate: "2020-01-01", licenceExpiryDate: "2036-01-01",
};
const vehicle = {
  category: "bike", make: "Bajaj", model: "Pulsar 150", plateNumber: "BA 1 KHA 1234",
  manufactureYear: "2020", registrationYear: "2020", color: "Black", fuelType: "petrol", serviceClass: "", seats: "",
};

describe("plates", () => {
  it("normalizes any spelling to one form", () => {
    for (const v of ["ba-99-pa-1234", "BA 99 PA 1234", "BA99PA1234", " Ba 99 Pa 1234 "]) {
      expect(normalizePlate(v)).toBe("BA99PA1234");
    }
  });
  it("accepts real Nepal plates and rejects nonsense", () => {
    for (const v of ["BA99PA1234", "BA1KHA1234", "LU1PA123", "GA12CHA9999"]) expect(isValidNepalPlate(v)).toBe(true);
    for (const v of ["", "1234", "BA", "BA99PA", "BA99PA12345", "99BAPA1234"]) expect(isValidNepalPlate(v)).toBe(false);
  });
  it("formats for display", () => {
    expect(formatPlate("ba99pa1234")).toBe("BA 99 PA 1234");
    expect(formatPlate("ba1kha1234")).toBe("BA 1 KHA 1234");
    expect(formatPlate("ba")).toBe("BA");
  });
});

describe("validatePersonal", () => {
  it("passes a complete form", () => {
    expect(validatePersonal(personal, TODAY)).toEqual({});
  });
  it("asks for every required field", () => {
    const e = validatePersonal({ ...personal, legalName: "", address: "", city: "", province: "", emergencyContactName: "" }, TODAY);
    expect(Object.keys(e).sort()).toEqual(["address", "city", "emergencyContactName", "legalName", "province"]);
  });
  it("checks the emergency number and the age", () => {
    expect(validatePersonal({ ...personal, emergencyContactPhone: "12" }, TODAY).emergencyContactPhone).toBeTruthy();
    expect(validatePersonal({ ...personal, dateOfBirth: "2012-01-01" }, TODAY).dateOfBirth).toBe(
      "You must be at least 18 years old to drive with ZamZam.",
    );
    expect(validatePersonal({ ...personal, dateOfBirth: "2008-09-21" }, TODAY).dateOfBirth).toBeUndefined(); // exactly 18 today
    expect(validatePersonal({ ...personal, dateOfBirth: "" }, TODAY).dateOfBirth).toBeTruthy();
  });
});

describe("validateLicence", () => {
  it("passes a valid licence", () => {
    expect(validateLicence(licence, TODAY)).toEqual({});
  });
  it("shows the exact expired-licence message", () => {
    const e = validateLicence({ ...licence, licenceExpiryDate: "2026-01-01" }, TODAY);
    expect(e.licenceExpiryDate).toBe(LICENCE_EXPIRED_MESSAGE);
    expect(LICENCE_EXPIRED_MESSAGE).toBe("Your driving licence has expired. Please upload a valid licence.");
  });
  it("treats a licence that expires today as expired", () => {
    expect(validateLicence({ ...licence, licenceExpiryDate: TODAY }, TODAY).licenceExpiryDate).toBe(LICENCE_EXPIRED_MESSAGE);
  });
  it("requires every field and a sensible date order", () => {
    const e = validateLicence({ licenceNumber: "", licenceClass: "", licenceAuthority: "", licenceIssueDate: "", licenceExpiryDate: "" }, TODAY);
    expect(Object.keys(e).sort()).toEqual(["licenceAuthority", "licenceClass", "licenceExpiryDate", "licenceIssueDate", "licenceNumber"]);
    expect(validateLicence({ ...licence, licenceIssueDate: "2030-01-01", licenceExpiryDate: "2029-01-01" }, TODAY).licenceExpiryDate).toBe(
      "The expiry date must be after the issue date.",
    );
    expect(validateLicence({ ...licence, licenceIssueDate: "2027-01-01" }, TODAY).licenceIssueDate).toBe(
      "The issue date can't be in the future.",
    );
  });
});

describe("validateVehicle", () => {
  it("passes a complete bike", () => {
    expect(validateVehicle(vehicle, 2026)).toEqual({});
  });
  it("requires a type, make, model, colour, year and a valid plate", () => {
    const e = validateVehicle({ ...vehicle, category: "", make: "", model: "", color: "", manufactureYear: "", plateNumber: "1234" }, 2026);
    expect(Object.keys(e).sort()).toEqual(["category", "color", "make", "manufactureYear", "model", "plateNumber"]);
    expect(e.plateNumber).toBe("Enter a valid number plate, for example BA 99 PA 1234.");
  });
  it("bounds the manufacturing and registration years", () => {
    expect(validateVehicle({ ...vehicle, manufactureYear: "1985" }, 2026).manufactureYear).toBeTruthy();
    expect(validateVehicle({ ...vehicle, manufactureYear: "2030" }, 2026).manufactureYear).toBeTruthy();
    expect(validateVehicle({ ...vehicle, registrationYear: "2010", manufactureYear: "2020" }, 2026).registrationYear).toBe(
      "Registration can't be earlier than the year it was made.",
    );
  });
  it("a car also needs a body type", () => {
    const car = { ...vehicle, category: "car", plateNumber: "BA 2 CHA 4321", serviceClass: "", seats: "4" };
    expect(validateVehicle(car, 2026).serviceClass).toBe("Choose the body type.");
    expect(validateVehicle({ ...car, serviceClass: "sedan" }, 2026)).toEqual({});
  });
});

const fakeFile = (type: string, size: number, name = "x") => ({ type, size, name }) as File;

describe("validateFile", () => {
  it("accepts jpg/png/webp/pdf up to 5 MB", async () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      expect(await validateFile(fakeFile(t, 1000), {})).toBeNull();
    }
  });
  it("rejects other types and big files with friendly text", async () => {
    expect(await validateFile(fakeFile("image/gif", 1000), {})).toBe("Only JPG, PNG, WEBP or PDF files up to 5 MB are allowed.");
    expect(await validateFile(fakeFile("image/jpeg", 6 * 1024 * 1024), {})).toBe("That file is bigger than 5 MB. Choose a smaller one.");
    expect(await validateFile(fakeFile("image/jpeg", 0), {})).toBe("That file is empty.");
  });
  it("photos must be images", async () => {
    expect(await validateFile(fakeFile("application/pdf", 1000), { imagesOnly: true })).toBe("Please upload a photo (JPG, PNG or WEBP).");
  });
  it("rejects a photo smaller than the minimum size", async () => {
    const small = () => Promise.resolve({ width: 120, height: 120 });
    expect(await validateFile(fakeFile("image/jpeg", 1000), { imagesOnly: true, minSize: 200, measure: small })).toBe(
      "This photo is too small. Use one at least 200 x 200 pixels.",
    );
    const big = () => Promise.resolve({ width: 640, height: 480 });
    expect(await validateFile(fakeFile("image/jpeg", 1000), { imagesOnly: true, minSize: 200, measure: big })).toBeNull();
  });
  it("does not block an upload when the size cannot be measured", async () => {
    const broken = () => Promise.reject(new Error("decode"));
    expect(await validateFile(fakeFile("image/jpeg", 1000), { imagesOnly: true, minSize: 200, measure: broken })).toBeNull();
  });
});
