import { describe, expect, it } from "vitest";
import { computeCompanyBlockingKeys, computeContactBlockingKeys } from "../src/dedup/blocking.js";

describe("computeCompanyBlockingKeys", () => {
  it("derives domain, phone, and name-prefix keys", () => {
    const keys = computeCompanyBlockingKeys({ name: "Acme Corporation", domain: "https://www.acme.com", phone: "(312) 555-0199" });
    expect(keys).toContainEqual({ keyType: "domain", keyValue: "acme.com" });
    expect(keys).toContainEqual({ keyType: "phone", keyValue: "+13125550199" });
    expect(keys).toContainEqual({ keyType: "name4", keyValue: "acme" });
  });
  it("skips keys it cannot normalize", () => {
    const keys = computeCompanyBlockingKeys({ name: null, domain: "not a domain", phone: "123" });
    expect(keys).toEqual([]);
  });
});

describe("computeContactBlockingKeys", () => {
  it("derives email, phone, and lastname-prefix keys", () => {
    const keys = computeContactBlockingKeys({ firstname: "Ada", lastname: "Lovelace", email: "Ada@Example.com", phone: "(312) 555-0199" });
    expect(keys).toContainEqual({ keyType: "email", keyValue: "ada@example.com" });
    expect(keys).toContainEqual({ keyType: "phone", keyValue: "+13125550199" });
    expect(keys).toContainEqual({ keyType: "lastname3", keyValue: "lov" });
  });
});
