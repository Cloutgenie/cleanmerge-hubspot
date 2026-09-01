import { describe, expect, it } from "vitest";
import { extractDomain, formatPhoneE164, properCase, splitName, transform } from "../src/transformations.js";

describe("transformations", () => {
  it("proper-cases hyphenated and apostrophized names", () => expect(properCase("  MARY-jANE o'NEILL ")).toBe("Mary-Jane O'Neill"));
  it("normalizes whitespace and particles", () => expect(properCase("LUDWIG VAN BEETHOVEN")).toBe("Ludwig van Beethoven"));
  it("extracts a normalized hostname", () => expect(extractDomain("https://www.Acme.co.uk/about?q=1")).toBe("acme.co.uk"));
  it("formats US phone numbers", () => expect(formatPhoneE164("(312) 555-0199")).toBe("+13125550199"));
  it("preserves explicit international country codes", () => expect(formatPhoneE164("+44 20 7946 0958")).toBe("+442079460958"));
  it("splits multi-part last names", () => expect(splitName("Ada Lovelace Byron")).toEqual({ firstName: "Ada", lastName: "Lovelace Byron" }));
  it("uppercases", () => expect(transform("Clean Merge", "Uppercase")).toBe("CLEAN MERGE"));
  it("rejects invalid domains", () => expect(() => extractDomain("not a domain")).toThrow());
});
