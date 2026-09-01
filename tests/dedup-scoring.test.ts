import { describe, expect, it } from "vitest";
import { scoreCompanyPair, scoreContactPair } from "../src/dedup/scoring.js";

describe("scoreCompanyPair", () => {
  it("tiers an exact domain + phone match as high confidence", () => {
    const result = scoreCompanyPair(
      { name: "Acme Corp", domain: "acme.com", phone: "312-555-0199" },
      { name: "Acme Corporation", domain: "acme.com", phone: "312-555-0199" },
    );
    expect(result.tier).toBe("high");
  });
  it("tiers unrelated companies as discard", () => {
    const result = scoreCompanyPair(
      { name: "Acme Corp", domain: "acme.com", phone: "312-555-0199" },
      { name: "Globex Inc", domain: "globex.com", phone: "212-555-0100" },
    );
    expect(result.tier).toBe("discard");
  });
  it("tiers a similar name with no shared identifiers as ambiguous or discard, never high", () => {
    const result = scoreCompanyPair(
      { name: "Acme Corp", domain: null, phone: null },
      { name: "Acme Corporation", domain: null, phone: null },
    );
    expect(result.tier).not.toBe("high");
  });
});

describe("scoreContactPair", () => {
  it("tiers an exact email match as high confidence regardless of name formatting", () => {
    const result = scoreContactPair(
      { firstname: "Bob", lastname: "Smith", email: "bob@example.com", phone: null },
      { firstname: "Robert", lastname: "Smith", email: "bob@example.com", phone: null },
    );
    expect(result.tier).toBe("high");
  });
  it("tiers contacts with nothing in common as discard", () => {
    const result = scoreContactPair(
      { firstname: "Bob", lastname: "Smith", email: "bob@example.com", phone: null },
      { firstname: "Alice", lastname: "Jones", email: "alice@other.com", phone: null },
    );
    expect(result.tier).toBe("discard");
  });
});
