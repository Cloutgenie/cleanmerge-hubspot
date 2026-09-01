import type { OAuthTokenManager } from "../token-manager.js";
import { computeCompanyBlockingKeys, computeContactBlockingKeys, type CompanyProperties, type ContactProperties } from "./blocking.js";
import { type CrmRecord, listAllObjects } from "./hubspot-client.js";
import { scoreCompanyPair, scoreContactPair, type ScoreResult } from "./scoring.js";
import type { DedupStore } from "./store.js";

export interface CandidateDetail {
  recordAId: string;
  recordBId: string;
  result: ScoreResult;
  propertiesA: Record<string, string | null>;
  propertiesB: Record<string, string | null>;
}

export interface DedupScanSummary {
  objectType: "COMPANY" | "CONTACT";
  recordsScanned: number;
  candidatePairsScored: number;
  highConfidence: number;
  ambiguous: number;
  discarded: number;
  topCandidates: CandidateDetail[];
}

/** Groups record ids by every blocking key they produce, so only records sharing a key are ever pairwise-compared. */
function buildBuckets<T>(records: CrmRecord[], computeKeys: (props: T) => { keyType: string; keyValue: string }[]): Map<string, Set<string>> {
  const buckets = new Map<string, Set<string>>();
  for (const record of records) {
    for (const key of computeKeys(record.properties as T)) {
      const bucketKey = `${key.keyType}:${key.keyValue}`;
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, new Set());
      buckets.get(bucketKey)!.add(record.id);
    }
  }
  return buckets;
}

async function scanObjectType<T>(
  portalId: number,
  objectType: "COMPANY" | "CONTACT",
  records: CrmRecord[],
  computeKeys: (props: T) => { keyType: string; keyValue: string }[],
  scorePair: (a: T, b: T) => ScoreResult,
  store: DedupStore,
): Promise<DedupScanSummary> {
  const byId = new Map(records.map((r) => [r.id, r]));
  const buckets = buildBuckets(records, computeKeys);
  const seenPairs = new Set<string>();
  const topCandidates: CandidateDetail[] = [];
  let high = 0;
  let ambiguous = 0;
  let discarded = 0;

  for (const ids of buckets.values()) {
    if (ids.size < 2) continue;
    const idArray = [...ids];
    for (let i = 0; i < idArray.length; i++) {
      for (let j = i + 1; j < idArray.length; j++) {
        const [aId, bId] = [idArray[i], idArray[j]].sort();
        const pairKey = `${aId}|${bId}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const a = byId.get(aId)!;
        const b = byId.get(bId)!;
        const result = scorePair(a.properties as T, b.properties as T);

        if (result.tier === "discard") { discarded++; continue; }
        if (result.tier === "high") high++; else ambiguous++;

        await store.upsertCandidate({ portalId, objectType, recordAId: aId, recordBId: bId, score: result.score, tier: result.tier, breakdown: result.breakdown });
        topCandidates.push({ recordAId: aId, recordBId: bId, result, propertiesA: a.properties, propertiesB: b.properties });
      }
    }
  }

  topCandidates.sort((x, y) => y.result.score - x.result.score);
  return {
    objectType,
    recordsScanned: records.length,
    candidatePairsScored: seenPairs.size,
    highConfidence: high,
    ambiguous,
    discarded,
    topCandidates: topCandidates.slice(0, 20),
  };
}

export async function runDedupScan(portalId: number, tokenManager: OAuthTokenManager, store: DedupStore): Promise<DedupScanSummary[]> {
  const accessToken = await tokenManager.getAccessToken(portalId);

  const companies = await listAllObjects(accessToken, "companies", ["name", "domain", "phone"]);
  const contacts = await listAllObjects(accessToken, "contacts", ["firstname", "lastname", "email", "phone"]);

  return [
    await scanObjectType<CompanyProperties>(portalId, "COMPANY", companies, computeCompanyBlockingKeys, scoreCompanyPair, store),
    await scanObjectType<ContactProperties>(portalId, "CONTACT", contacts, computeContactBlockingKeys, scoreContactPair, store),
  ];
}
