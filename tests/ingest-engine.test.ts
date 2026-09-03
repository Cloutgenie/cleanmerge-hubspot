import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/dedup/hubspot-client.js", async () => {
  const actual = await vi.importActual<typeof import("../src/dedup/hubspot-client.js")>("../src/dedup/hubspot-client.js");
  return {
    ...actual,
    listAllObjects: vi.fn(),
    createObject: vi.fn(),
    updateObject: vi.fn(),
    ensurePropertyExists: vi.fn(),
  };
});

import { createObject, ensurePropertyExists, listAllObjects, updateObject } from "../src/dedup/hubspot-client.js";
import { runIngest } from "../src/ingest/engine.js";
import type { FieldMappingRow, IngestStore, WarehouseConnectionRow } from "../src/ingest/store.js";
import type { DedupStore } from "../src/dedup/store.js";
import type { OAuthTokenManager } from "../src/token-manager.js";
import type { WarehouseConnector } from "../src/ingest/connector.js";

const connection: WarehouseConnectionRow = { id: 1, portalId: 42, name: "test-wh", connectorType: "postgres", config: {}, credentials: "secret" };

const baseMapping: FieldMappingRow = {
  id: 1,
  connectionId: 1,
  objectType: "COMPANY",
  sourceQuery: "SELECT * FROM companies",
  mappings: [
    { sourceColumn: "raw_name", hubspotProperty: "name", transformationType: "Proper_Case" },
    { sourceColumn: "raw_domain", hubspotProperty: "domain", transformationType: "Extract_Domain" },
  ],
  matchKeyColumns: ["raw_domain"],
  cronSchedule: null,
  enabled: true,
};

function fakeIngestStore(mapping: FieldMappingRow): IngestStore {
  return {
    getConnection: vi.fn().mockResolvedValue(connection),
    listEnabledMappings: vi.fn().mockResolvedValue([mapping]),
    startRun: vi.fn().mockResolvedValue(1),
    finishRun: vi.fn().mockResolvedValue(undefined),
  } as unknown as IngestStore;
}

function fakeDedupStore(): DedupStore {
  return { upsertCandidate: vi.fn().mockResolvedValue(undefined) } as unknown as DedupStore;
}

const tokenManager = { getAccessToken: vi.fn().mockResolvedValue("access-token") } as unknown as OAuthTokenManager;
const connectorFactory = (connector: WarehouseConnector) => () => connector;

beforeEach(() => {
  vi.mocked(listAllObjects).mockReset();
  vi.mocked(createObject).mockReset();
  vi.mocked(updateObject).mockReset();
  vi.mocked(ensurePropertyExists).mockReset();
});

describe("runIngest", () => {
  it("creates a new record when no existing HubSpot record matches", async () => {
    vi.mocked(listAllObjects).mockResolvedValue([]);
    vi.mocked(createObject).mockResolvedValue({ id: "999", properties: {} });
    const connector: WarehouseConnector = { runQuery: vi.fn().mockResolvedValue([{ raw_name: "acme corp", raw_domain: "https://acme.com" }]) };
    const dedupStore = fakeDedupStore();

    const summaries = await runIngest(42, 1, tokenManager, fakeIngestStore(baseMapping), dedupStore, connectorFactory(connector));

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ rowsRead: 1, rowsCreated: 1, rowsUpdated: 0, rowsQueuedForReview: 0, rowsErrored: 0 });
    expect(createObject).toHaveBeenCalledWith("access-token", "companies", { name: "Acme Corp", domain: "acme.com" });
    expect(updateObject).not.toHaveBeenCalled();
    expect(dedupStore.upsertCandidate).not.toHaveBeenCalled();
  });

  it("updates the matched record instead of creating one on a high-confidence match", async () => {
    vi.mocked(listAllObjects).mockResolvedValue([{ id: "500", properties: { name: "Acme Corp", domain: "acme.com", phone: null } }]);
    const connector: WarehouseConnector = { runQuery: vi.fn().mockResolvedValue([{ raw_name: "acme corp", raw_domain: "https://acme.com" }]) };
    const dedupStore = fakeDedupStore();

    const summaries = await runIngest(42, 1, tokenManager, fakeIngestStore(baseMapping), dedupStore, connectorFactory(connector));

    expect(summaries[0]).toMatchObject({ rowsCreated: 0, rowsUpdated: 1, rowsQueuedForReview: 0 });
    expect(updateObject).toHaveBeenCalledWith("access-token", "companies", "500", { name: "Acme Corp", domain: "acme.com" });
    expect(createObject).not.toHaveBeenCalled();
  });

  it("queues an ambiguous match for human review instead of writing anything", async () => {
    // Exact name + phone match but a different domain caps the score at 0.95 (below the 0.97
    // high-confidence threshold, above the 0.70 ambiguous floor) — see MAX_SCORE_WITHOUT_HARD_MATCH.
    const mappingWithPhone: FieldMappingRow = {
      ...baseMapping,
      mappings: [...baseMapping.mappings, { sourceColumn: "raw_phone", hubspotProperty: "phone", transformationType: "Format_Phone_E164" }],
    };
    vi.mocked(listAllObjects).mockResolvedValue([{ id: "500", properties: { name: "Acme Corp", domain: "other.com", phone: "+13125550100" } }]);
    const connector: WarehouseConnector = {
      runQuery: vi.fn().mockResolvedValue([{ raw_name: "acme corp", raw_domain: "https://acme-holdings.com", raw_phone: "(312) 555-0100" }]),
    };
    const dedupStore = fakeDedupStore();

    const summaries = await runIngest(42, 1, tokenManager, fakeIngestStore(mappingWithPhone), dedupStore, connectorFactory(connector));

    expect(summaries[0].rowsQueuedForReview).toBe(1);
    expect(summaries[0].rowsCreated).toBe(0);
    expect(summaries[0].rowsUpdated).toBe(0);
    expect(createObject).not.toHaveBeenCalled();
    expect(updateObject).not.toHaveBeenCalled();
    expect(dedupStore.upsertCandidate).toHaveBeenCalledWith(expect.objectContaining({ source: "ingest", recordAId: "500", tier: "ambiguous" }));
  });

  it("isolates a per-row failure (an unparseable domain) so the run continues and the row is counted as errored", async () => {
    vi.mocked(listAllObjects).mockResolvedValue([]);
    vi.mocked(createObject).mockResolvedValue({ id: "1", properties: {} });
    const connector: WarehouseConnector = {
      runQuery: vi.fn().mockResolvedValue([
        { raw_name: "bad row", raw_domain: "not a domain" },
        { raw_name: "good row", raw_domain: "https://good.com" },
      ]),
    };
    const dedupStore = fakeDedupStore();

    const summaries = await runIngest(42, 1, tokenManager, fakeIngestStore(baseMapping), dedupStore, connectorFactory(connector));

    expect(summaries[0].rowsRead).toBe(2);
    expect(summaries[0].rowsErrored).toBe(1);
    expect(summaries[0].rowsCreated).toBe(1);
    expect(summaries[0].errors).toHaveLength(1);
    expect(createObject).toHaveBeenCalledTimes(1);
  });
});
