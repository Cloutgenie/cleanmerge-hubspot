import crypto from "node:crypto";
import { buildBlockingIndex } from "../dedup/engine.js";
import { computeCompanyBlockingKeys, computeContactBlockingKeys, type CompanyProperties, type ContactProperties } from "../dedup/blocking.js";
import { createObject, ensurePropertyExists, listAllObjects, updateObject, type CrmRecord } from "../dedup/hubspot-client.js";
import { scoreCompanyPair, scoreContactPair, type ScoreResult } from "../dedup/scoring.js";
import type { DedupStore } from "../dedup/store.js";
import { transform } from "../transformations.js";
import type { OAuthTokenManager } from "../token-manager.js";
import type { WarehouseConnector } from "./connector.js";
import type { FieldMappingRow, IngestRunCounts, IngestStore, ObjectType, WarehouseConnectionRow } from "./store.js";

const HUBSPOT_PROPERTIES: Record<ObjectType, string[]> = {
  COMPANY: ["name", "domain", "phone"],
  CONTACT: ["firstname", "lastname", "email", "phone"],
};

export interface IngestRunSummary {
  objectType: ObjectType;
  rowsRead: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsQueuedForReview: number;
  rowsErrored: number;
  errors: Array<{ rowIndex: number; error: string }>;
}

/** Deterministic id for a not-yet-created HubSpot record, so the same incoming row maps to the same review-queue candidate across runs instead of piling up duplicates. */
function syntheticIngestId(connectionId: number, matchKeyColumns: string[], row: Record<string, unknown>): string {
  const key = matchKeyColumns.map((col) => String(row[col] ?? "")).join("|");
  const hash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
  return `ingest:${connectionId}:${hash}`;
}

function coerce(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function buildProperties(row: Record<string, unknown>, mapping: FieldMappingRow): Record<string, string | null> {
  const properties: Record<string, string | null> = {};
  for (const entry of mapping.mappings) {
    const raw = coerce(row[entry.sourceColumn]);
    if (raw === null) { properties[entry.hubspotProperty] = null; continue; }
    properties[entry.hubspotProperty] = entry.transformationType ? transform(raw, entry.transformationType) : raw;
  }
  return properties;
}

function scorePair(objectType: ObjectType, incoming: Record<string, string | null>, existing: Record<string, string | null>): ScoreResult {
  return objectType === "COMPANY"
    ? scoreCompanyPair(incoming as CompanyProperties, existing as CompanyProperties)
    : scoreContactPair(incoming as ContactProperties, existing as ContactProperties);
}

function computeKeys(objectType: ObjectType, properties: Record<string, string | null>): { keyType: string; keyValue: string }[] {
  return objectType === "COMPANY"
    ? computeCompanyBlockingKeys(properties as CompanyProperties)
    : computeContactBlockingKeys(properties as ContactProperties);
}

function toHubSpotType(objectType: ObjectType): "companies" | "contacts" {
  return objectType === "COMPANY" ? "companies" : "contacts";
}

async function runMapping(
  accessToken: string,
  portalId: number,
  connection: WarehouseConnectionRow,
  mapping: FieldMappingRow,
  connector: WarehouseConnector,
  ingestStore: IngestStore,
  dedupStore: DedupStore,
  triggeredBy: string,
): Promise<IngestRunSummary> {
  const runId = await ingestStore.startRun(portalId, connection.id, mapping.objectType, triggeredBy);
  const counts: IngestRunCounts = { rowsRead: 0, rowsCreated: 0, rowsUpdated: 0, rowsQueuedForReview: 0, rowsErrored: 0, errors: [] };

  try {
    for (const entry of mapping.mappings) {
      if (entry.createIfMissing) {
        await ensurePropertyExists(accessToken, toHubSpotType(mapping.objectType), entry.hubspotProperty, entry.hubspotProperty);
      }
    }

    const existingRecords = await listAllObjects(accessToken, toHubSpotType(mapping.objectType), HUBSPOT_PROPERTIES[mapping.objectType]);
    const computeKeysFor = (props: CompanyProperties | ContactProperties) => computeKeys(mapping.objectType, props as Record<string, string | null>);
    const { buckets, byId } = buildBlockingIndex<CompanyProperties | ContactProperties>(existingRecords, computeKeysFor);

    const rows = await connector.runQuery(mapping.sourceQuery);
    counts.rowsRead = rows.length;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      try {
        const properties = buildProperties(rows[rowIndex], mapping);
        const candidateIds = new Set<string>();
        for (const key of computeKeys(mapping.objectType, properties)) {
          for (const id of buckets.get(`${key.keyType}:${key.keyValue}`) ?? []) candidateIds.add(id);
        }

        let best: { record: CrmRecord; result: ScoreResult } | null = null;
        for (const id of candidateIds) {
          const record = byId.get(id);
          if (!record) continue;
          const result = scorePair(mapping.objectType, properties, record.properties);
          if (!best || result.score > best.result.score) best = { record, result };
        }

        if (!best || best.result.tier === "discard") {
          const created = await createObject(accessToken, toHubSpotType(mapping.objectType), asWritable(properties));
          counts.rowsCreated++;
          existingRecords.push(created);
        } else if (best.result.tier === "high") {
          await updateObject(accessToken, toHubSpotType(mapping.objectType), best.record.id, asWritable(properties));
          counts.rowsUpdated++;
        } else {
          const syntheticId = syntheticIngestId(connection.id, mapping.matchKeyColumns, rows[rowIndex]);
          await dedupStore.upsertCandidate({
            portalId,
            objectType: mapping.objectType,
            recordAId: best.record.id,
            recordBId: syntheticId,
            score: best.result.score,
            tier: best.result.tier,
            breakdown: best.result.breakdown,
            propertiesA: best.record.properties,
            propertiesB: properties,
            source: "ingest",
          });
          counts.rowsQueuedForReview++;
        }
      } catch (error) {
        counts.rowsErrored++;
        counts.errors.push({ rowIndex, error: error instanceof Error ? error.message : String(error) });
      }
    }

    await ingestStore.finishRun(runId, "succeeded", counts);
  } catch (error) {
    counts.errors.push({ rowIndex: -1, error: error instanceof Error ? error.message : String(error) });
    await ingestStore.finishRun(runId, "failed", counts);
    throw error;
  }

  return { objectType: mapping.objectType, ...counts };
}

function asWritable(properties: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(properties).filter((entry): entry is [string, string] => entry[1] !== null));
}

export async function runIngest(
  portalId: number,
  connectionId: number,
  tokenManager: OAuthTokenManager,
  ingestStore: IngestStore,
  dedupStore: DedupStore,
  connectorFactory: (connection: WarehouseConnectionRow) => WarehouseConnector,
  triggeredBy: "manual" | "scheduled" = "manual",
): Promise<IngestRunSummary[]> {
  const connection = await ingestStore.getConnection(connectionId);
  if (!connection) throw new Error(`No warehouse connection found with id ${connectionId}`);
  if (connection.portalId !== portalId) throw new Error(`Connection ${connectionId} does not belong to portal ${portalId}`);

  const accessToken = await tokenManager.getAccessToken(portalId);
  const connector = connectorFactory(connection);
  const mappings = await ingestStore.listEnabledMappings(connectionId);

  const summaries: IngestRunSummary[] = [];
  for (const mapping of mappings) {
    summaries.push(await runMapping(accessToken, portalId, connection, mapping, connector, ingestStore, dedupStore, triggeredBy));
  }
  return summaries;
}
