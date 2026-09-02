import { describe, expect, it } from "vitest";
import { normalizeForMerge, pickWinner } from "../src/dedup/merge-executor.js";

describe("pickWinner", () => {
  it("prefers the record with more populated fields", () => {
    const result = pickWinner(
      "CONTACT",
      "100", { firstname: "Bob", lastname: null, email: null, phone: null },
      "200", { firstname: "Bob", lastname: "Smith", email: "bob@example.com", phone: "312-555-0111" },
    );
    expect(result).toEqual({ winnerId: "200", loserId: "100" });
  });

  it("tie-breaks to the lower numeric id when completeness is equal", () => {
    const props = { name: "Acme", domain: "acme.com", phone: "312-555-0101" };
    const result = pickWinner("COMPANY", "500", props, "300", props);
    expect(result).toEqual({ winnerId: "300", loserId: "500" });
  });
});

describe("normalizeForMerge", () => {
  it("proper-cases a company name and normalizes its domain", () => {
    const updates = normalizeForMerge("COMPANY", { name: "ACME corp", domain: "https://www.Acme.com", phone: null });
    expect(updates).toEqual({ name: "Acme Corp", domain: "acme.com" });
  });

  it("formats a contact's phone number and skips already-normalized fields", () => {
    const updates = normalizeForMerge("CONTACT", { firstname: "Bob", lastname: "Smith", email: null, phone: "(312) 555-0111" });
    expect(updates).toEqual({ phone: "+13125550111" });
  });

  it("omits fields that fail to normalize instead of throwing", () => {
    const updates = normalizeForMerge("COMPANY", { name: "Acme", domain: "not a domain", phone: null });
    expect(updates).toEqual({});
  });
});
