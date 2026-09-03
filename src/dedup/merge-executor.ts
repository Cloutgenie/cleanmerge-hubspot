import { extractDomain, formatPhoneE164, properCase } from "../transformations.js";
import { createObject, getObject, mergeObjects, updateObject } from "./hubspot-client.js";
import type { DedupStore, MergeCandidate } from "./store.js";

type ObjectType = "COMPANY" | "CONTACT";
type HubSpotObjectType = "companies" | "contacts";

const COMPANY_PROPERTIES = ["name", "domain", "phone"];
const CONTACT_PROPERTIES = ["firstname", "lastname", "email", "phone"];

function propertiesFor(objectType: ObjectType): string[] {
  return objectType === "COMPANY" ? COMPANY_PROPERTIES : CONTACT_PROPERTIES;
}

function toHubSpotType(objectType: ObjectType): HubSpotObjectType {
  return objectType === "COMPANY" ? "companies" : "contacts";
}

function completeness(properties: Record<string, string | null>, fields: string[]): number {
  return fields.filter((field) => properties[field]?.trim()).length;
}

export interface WinnerSelection {
  winnerId: string;
  loserId: string;
}

/**
 * Picks the surviving record: whichever has more populated fields (a proxy for "more complete
 * data"), tie-broken by the lower numeric id (HubSpot ids are assigned in creation order, so this
 * favors the more established record when completeness is equal).
 */
export function pickWinner(objectType: ObjectType, idA: string, propertiesA: Record<string, string | null>, idB: string, propertiesB: Record<string, string | null>): WinnerSelection {
  const fields = propertiesFor(objectType);
  const scoreA = completeness(propertiesA, fields);
  const scoreB = completeness(propertiesB, fields);
  if (scoreA !== scoreB) return scoreA > scoreB ? { winnerId: idA, loserId: idB } : { winnerId: idB, loserId: idA };
  return Number(idA) <= Number(idB) ? { winnerId: idA, loserId: idB } : { winnerId: idB, loserId: idA };
}

function tryNormalize<T>(fn: () => T): T | null {
  try { return fn(); } catch { return null; }
}

/** Normalizes the survivor's key fields before merging, reusing the same functions the workflow action exposes to users. Skips any field that fails to normalize (e.g. an unparseable phone) rather than blocking the merge. */
export function normalizeForMerge(objectType: ObjectType, properties: Record<string, string | null>): Record<string, string> {
  const updates: Record<string, string> = {};
  if (objectType === "COMPANY") {
    if (properties.name?.trim()) {
      const name = tryNormalize(() => properCase(properties.name!.trim()));
      if (name && name !== properties.name) updates.name = name;
    }
    if (properties.domain?.trim()) {
      const domain = tryNormalize(() => extractDomain(properties.domain!.trim()));
      if (domain && domain !== properties.domain) updates.domain = domain;
    }
  } else {
    if (properties.firstname?.trim()) {
      const firstname = tryNormalize(() => properCase(properties.firstname!.trim()));
      if (firstname && firstname !== properties.firstname) updates.firstname = firstname;
    }
    if (properties.lastname?.trim()) {
      const lastname = tryNormalize(() => properCase(properties.lastname!.trim()));
      if (lastname && lastname !== properties.lastname) updates.lastname = lastname;
    }
  }
  if (properties.phone?.trim()) {
    const phone = tryNormalize(() => formatPhoneE164(properties.phone!.trim()));
    if (phone && phone !== properties.phone) updates.phone = phone;
  }
  return updates;
}

export interface MergeOutcome {
  recordAId: string;
  recordBId: string;
  winnerId: string;
  loserId: string;
  mergedRecordId: string;
}

export type TriggeredBy = "human_review" | "auto_high_confidence";

/**
 * Fetches live data for both records (not the scan-time snapshot — state may have changed since),
 * normalizes the survivor, merges via HubSpot's API, and logs a full before/after snapshot for
 * audit — HubSpot has no un-merge API, so this log is the only record of what happened.
 */
export async function executeMerge(
  accessToken: string,
  portalId: number,
  objectType: ObjectType,
  recordAId: string,
  recordBId: string,
  store: DedupStore,
  triggeredBy: TriggeredBy,
): Promise<MergeOutcome> {
  const hubspotType = toHubSpotType(objectType);
  const fields = propertiesFor(objectType);

  const [recordA, recordB] = await Promise.all([
    getObject(accessToken, hubspotType, recordAId, fields),
    getObject(accessToken, hubspotType, recordBId, fields),
  ]);

  const { winnerId, loserId } = pickWinner(objectType, recordA.id, recordA.properties, recordB.id, recordB.properties);
  const winnerProperties = winnerId === recordA.id ? recordA.properties : recordB.properties;

  const normalized = normalizeForMerge(objectType, winnerProperties);
  if (Object.keys(normalized).length > 0) {
    await updateObject(accessToken, hubspotType, winnerId, normalized);
  }

  const merged = await mergeObjects(accessToken, hubspotType, winnerId, loserId);
  // HubSpot's contact merge can return a survivor id that differs from both inputs (internal
  // canonical-id resolution) — company merges have not shown this, but log the actual returned
  // id either way rather than assuming the requested primaryObjectId is what actually survived.

  await store.recordMerge({
    portalId,
    objectType,
    winnerId,
    loserId,
    triggeredBy,
    fieldSnapshot: {
      before: { [recordA.id]: recordA.properties, [recordB.id]: recordB.properties },
      normalizedWinnerFields: normalized,
      requestedPrimaryObjectId: winnerId,
      actualSurvivorId: merged.id,
    },
  });
  await store.markMerged(portalId, objectType, recordAId, recordBId);

  return { recordAId, recordBId, winnerId, loserId, mergedRecordId: merged.id };
}

export interface MergeBatchResult {
  succeeded: MergeOutcome[];
  failed: Array<{ recordAId: string; recordBId: string; error: string }>;
}

/** Executes a batch of merges independently — one failure (e.g. a record deleted since the scan) doesn't block the rest. */
export async function executeMergeBatch(
  accessToken: string,
  portalId: number,
  candidates: MergeCandidate[],
  store: DedupStore,
  triggeredBy: TriggeredBy,
): Promise<MergeBatchResult> {
  const succeeded: MergeOutcome[] = [];
  const failed: Array<{ recordAId: string; recordBId: string; error: string }> = [];

  for (const candidate of candidates) {
    try {
      const outcome = await executeMerge(accessToken, portalId, candidate.objectType, candidate.recordAId, candidate.recordBId, store, triggeredBy);
      succeeded.push(outcome);
    } catch (error) {
      failed.push({ recordAId: candidate.recordAId, recordBId: candidate.recordBId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { succeeded, failed };
}

export interface IngestResolutionOutcome {
  recordAId: string;
  recordBId: string;
  action: "updated" | "created";
  resultId: string;
}

export interface IngestResolutionBatchResult {
  succeeded: IngestResolutionOutcome[];
  failed: Array<{ recordAId: string; recordBId: string; error: string }>;
}

/**
 * Executes human decisions on ingest-sourced ambiguous matches: approved ("yes, same entity") updates
 * the existing record (record_a_id) with the incoming row's properties; rejected ("no, different
 * entity") creates a new record from them instead. Unlike the internal-dedup merge path, there's no
 * HubSpot Merge API call — record_b_id is a synthetic id for a row that never existed as a real object.
 */
export async function executeIngestBatch(accessToken: string, portalId: number, store: DedupStore): Promise<IngestResolutionBatchResult> {
  const decisions = await store.listIngestDecisions(portalId);
  const succeeded: IngestResolutionOutcome[] = [];
  const failed: Array<{ recordAId: string; recordBId: string; error: string }> = [];

  for (const decision of decisions) {
    try {
      const hubspotType = toHubSpotType(decision.objectType);
      const properties = Object.fromEntries(
        Object.entries(decision.propertiesB).filter((entry): entry is [string, string] => entry[1] != null),
      );
      let resultId: string;
      let action: "updated" | "created";
      if (decision.decision === "approved") {
        await updateObject(accessToken, hubspotType, decision.recordAId, properties);
        resultId = decision.recordAId;
        action = "updated";
      } else {
        const created = await createObject(accessToken, hubspotType, properties);
        resultId = created.id;
        action = "created";
      }
      await store.markIngestResolved(portalId, decision.objectType, decision.recordAId, decision.recordBId);
      succeeded.push({ recordAId: decision.recordAId, recordBId: decision.recordBId, action, resultId });
    } catch (error) {
      failed.push({ recordAId: decision.recordAId, recordBId: decision.recordBId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { succeeded, failed };
}
