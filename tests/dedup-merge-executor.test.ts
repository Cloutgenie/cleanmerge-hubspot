import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/dedup/hubspot-client.js", async () => {
  const actual = await vi.importActual<typeof import("../src/dedup/hubspot-client.js")>("../src/dedup/hubspot-client.js");
  return { ...actual, createObject: vi.fn(), updateObject: vi.fn() };
});

import { createObject, updateObject } from "../src/dedup/hubspot-client.js";
import { executeIngestBatch, normalizeForMerge, pickWinner } from "../src/dedup/merge-executor.js";
import type { DedupStore, IngestDecisionRow } from "../src/dedup/store.js";

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

describe("executeIngestBatch", () => {
  beforeEach(() => {
    vi.mocked(createObject).mockReset();
    vi.mocked(updateObject).mockReset();
  });

  function fakeDedupStore(decisions: IngestDecisionRow[]): DedupStore {
    return {
      listIngestDecisions: vi.fn().mockResolvedValue(decisions),
      markIngestResolved: vi.fn().mockResolvedValue(undefined),
    } as unknown as DedupStore;
  }

  it("updates the existing record when the decision is approved", async () => {
    vi.mocked(updateObject).mockResolvedValue(undefined);
    const dedupStore = fakeDedupStore([{ objectType: "COMPANY", recordAId: "500", recordBId: "ingest:1:abc", decision: "approved", propertiesB: { name: "Acme Corp", domain: "acme.com" } }]);

    const result = await executeIngestBatch("token", 42, dedupStore);

    expect(result.succeeded).toEqual([{ recordAId: "500", recordBId: "ingest:1:abc", action: "updated", resultId: "500" }]);
    expect(updateObject).toHaveBeenCalledWith("token", "companies", "500", { name: "Acme Corp", domain: "acme.com" });
    expect(createObject).not.toHaveBeenCalled();
    expect(dedupStore.markIngestResolved).toHaveBeenCalledWith(42, "COMPANY", "500", "ingest:1:abc");
  });

  it("creates a new record when the decision is rejected", async () => {
    vi.mocked(createObject).mockResolvedValue({ id: "999", properties: {} });
    const dedupStore = fakeDedupStore([{ objectType: "COMPANY", recordAId: "500", recordBId: "ingest:1:def", decision: "rejected", propertiesB: { name: "Acme Holdings", domain: "acme-holdings.com" } }]);

    const result = await executeIngestBatch("token", 42, dedupStore);

    expect(result.succeeded).toEqual([{ recordAId: "500", recordBId: "ingest:1:def", action: "created", resultId: "999" }]);
    expect(createObject).toHaveBeenCalledWith("token", "companies", { name: "Acme Holdings", domain: "acme-holdings.com" });
    expect(updateObject).not.toHaveBeenCalled();
  });

  it("isolates a failure to one decision and continues the batch", async () => {
    vi.mocked(updateObject).mockRejectedValueOnce(new Error("HubSpot update companies failed (404)"));
    const dedupStore = fakeDedupStore([
      { objectType: "COMPANY", recordAId: "500", recordBId: "ingest:1:abc", decision: "approved", propertiesB: { name: "Acme Corp" } },
    ]);

    const result = await executeIngestBatch("token", 42, dedupStore);

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([{ recordAId: "500", recordBId: "ingest:1:abc", error: "HubSpot update companies failed (404)" }]);
    expect(dedupStore.markIngestResolved).not.toHaveBeenCalled();
  });
});
