import { describe, expect, it } from "vitest";
import { cn, initials, npr } from "./utils";

describe("cn with the project type scale", () => {
  it("keeps a text colour when a custom font size is also present (the size is not a colour)", () => {
    expect(cn("text-white", "text-h2")).toBe("text-white text-h2");
    expect(cn("text-white", "text-body-sm")).toBe("text-white text-body-sm");
  });
  it("still lets a later font size or colour win over an earlier one of the same kind", () => {
    expect(cn("text-h1", "text-h2")).toBe("text-h2");
    expect(cn("text-white", "text-ink")).toBe("text-ink");
  });
});

describe("cn", () => {
  it("merges class names and resolves Tailwind conflicts (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
});

describe("npr", () => {
  it("formats a whole number as NPR currency", () => {
    expect(npr(1000)).toContain("1,000");
  });

  it("formats with 2 decimal places by default", () => {
    expect(npr(99.5)).toMatch(/99\.50/);
  });

  it("compacts large numbers when opts.compact is set", () => {
    const compact = npr(150000, { compact: true });
    // Compact notation drops the fractional part and abbreviates (e.g. "1.5L"/"150K")
    expect(compact).not.toContain(".00");
  });

  it("formats zero", () => {
    expect(npr(0)).toContain("0.00");
  });

  it("formats negative amounts (refunds/debits displayed as negative)", () => {
    expect(npr(-500)).toContain("500");
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Anita Rai")).toBe("AR");
  });

  it("uppercases the result", () => {
    expect(initials("anita rai")).toBe("AR");
  });

  it("handles a single-word name", () => {
    expect(initials("Cher")).toBe("C");
  });

  it("caps at two initials for names with more than two words", () => {
    expect(initials("Anita Kumari Rai")).toBe("AK");
  });

  it("collapses multiple spaces without producing empty initials", () => {
    expect(initials("Anita  Rai")).toBe("AR");
  });

  it("returns an empty string for an empty name", () => {
    expect(initials("")).toBe("");
  });
});
