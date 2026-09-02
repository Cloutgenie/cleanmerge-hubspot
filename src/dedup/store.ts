import type { Pool } from "pg";
import { createPool } from "../db.js";
import type { JudgmentResult } from "./ai-judgment.js";
import type { DedupTier } from "./scoring.js";

export interface DedupCandidateRow {
  portalId: number;
  objectType: "COMPANY" | "CONTACT";
  recordAId: string;
  recordBId: string;
  score: number;
  tier: DedupTier;
  breakdown: Record<string, number>;
  propertiesA: Record<string, string | null>;
  propertiesB: Record<string, string | null>;
}

export type ReviewDecision = "approved" | "rejected";

export interface MergeCandidate {
  objectType: "COMPANY" | "CONTACT";
  recordAId: string;
  recordBId: string;
}

export interface MergeLogRow {
  portalId: number;
  objectType: "COMPANY" | "CONTACT";
  winnerId: string;
  loserId: string;
  triggeredBy: string;
  fieldSnapshot: unknown;
}

export interface ReviewCandidateRow {
  objectType: "COMPANY" | "CONTACT";
  recordAId: string;
  recordBId: string;
  score: number;
  breakdown: Record<string, number>;
  propertiesA: Record<string, string | null>;
  propertiesB: Record<string, string | null>;
  aiSameEntity: boolean | null;
  aiConfidence: number | null;
  aiRationale: string | null;
  status: string;
}

export class DedupStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = createPool(databaseUrl);
  }

  async initialize(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS dedup_candidates (
      id BIGSERIAL PRIMARY KEY,
      portal_id BIGINT NOT NULL,
      object_type TEXT NOT NULL,
      record_a_id TEXT NOT NULL,
      record_b_id TEXT NOT NULL,
      score REAL NOT NULL,
      tier TEXT NOT NULL,
      breakdown JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (portal_id, object_type, record_a_id, record_b_id)
    )`);
    await this.pool.query(`ALTER TABLE dedup_candidates
      ADD COLUMN IF NOT EXISTS ai_same_entity BOOLEAN,
      ADD COLUMN IF NOT EXISTS ai_confidence REAL,
      ADD COLUMN IF NOT EXISTS ai_rationale TEXT,
      ADD COLUMN IF NOT EXISTS ai_judged_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS properties_a JSONB,
      ADD COLUMN IF NOT EXISTS properties_b JSONB`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS merge_log (
      id BIGSERIAL PRIMARY KEY,
      portal_id BIGINT NOT NULL,
      object_type TEXT NOT NULL,
      winner_id TEXT NOT NULL,
      loser_id TEXT NOT NULL,
      triggered_by TEXT NOT NULL,
      field_snapshot JSONB NOT NULL,
      merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }

  async upsertCandidate(row: DedupCandidateRow): Promise<void> {
    const [recordAId, recordBId] = [row.recordAId, row.recordBId].sort();
    const [propertiesA, propertiesB] = recordAId === row.recordAId ? [row.propertiesA, row.propertiesB] : [row.propertiesB, row.propertiesA];
    await this.pool.query(
      `INSERT INTO dedup_candidates (portal_id, object_type, record_a_id, record_b_id, score, tier, breakdown, properties_a, properties_b, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       ON CONFLICT (portal_id, object_type, record_a_id, record_b_id)
       DO UPDATE SET score = EXCLUDED.score, tier = EXCLUDED.tier, breakdown = EXCLUDED.breakdown,
         properties_a = EXCLUDED.properties_a, properties_b = EXCLUDED.properties_b, updated_at = NOW()`,
      [row.portalId, row.objectType, recordAId, recordBId, row.score, row.tier, JSON.stringify(row.breakdown), JSON.stringify(propertiesA), JSON.stringify(propertiesB)],
    );
  }

  async recordJudgment(portalId: number, objectType: "COMPANY" | "CONTACT", recordAId: string, recordBId: string, judgment: JudgmentResult): Promise<void> {
    const [a, b] = [recordAId, recordBId].sort();
    await this.pool.query(
      `UPDATE dedup_candidates SET ai_same_entity = $5, ai_confidence = $6, ai_rationale = $7, ai_judged_at = NOW(), updated_at = NOW()
       WHERE portal_id = $1 AND object_type = $2 AND record_a_id = $3 AND record_b_id = $4`,
      [portalId, objectType, a, b, judgment.sameEntity, judgment.confidence, judgment.rationale],
    );
  }

  /** Pending ambiguous-tier candidates, pre-sorted so the AI's most-confident same-entity calls surface first. */
  async listPendingReview(portalId: number): Promise<ReviewCandidateRow[]> {
    const result = await this.pool.query(
      `SELECT object_type, record_a_id, record_b_id, score, breakdown, properties_a, properties_b, ai_same_entity, ai_confidence, ai_rationale, status
       FROM dedup_candidates
       WHERE portal_id = $1 AND tier = 'ambiguous' AND status = 'pending'
       ORDER BY ai_confidence DESC NULLS LAST, score DESC`,
      [portalId],
    );
    return result.rows.map((r) => ({
      objectType: r.object_type,
      recordAId: r.record_a_id,
      recordBId: r.record_b_id,
      score: r.score,
      breakdown: r.breakdown,
      propertiesA: r.properties_a,
      propertiesB: r.properties_b,
      aiSameEntity: r.ai_same_entity,
      aiConfidence: r.ai_confidence,
      aiRationale: r.ai_rationale,
      status: r.status,
    }));
  }

  async recordDecision(portalId: number, objectType: "COMPANY" | "CONTACT", recordAId: string, recordBId: string, decision: ReviewDecision): Promise<void> {
    const [a, b] = [recordAId, recordBId].sort();
    await this.pool.query(
      `UPDATE dedup_candidates SET status = $5, updated_at = NOW()
       WHERE portal_id = $1 AND object_type = $2 AND record_a_id = $3 AND record_b_id = $4`,
      [portalId, objectType, a, b, decision],
    );
  }

  /** Human-approved pairs (from the review queue) waiting to be merged. */
  async listApprovedForMerge(portalId: number): Promise<MergeCandidate[]> {
    const result = await this.pool.query(
      `SELECT object_type, record_a_id, record_b_id FROM dedup_candidates WHERE portal_id = $1 AND status = 'approved'`,
      [portalId],
    );
    return result.rows.map((r) => ({ objectType: r.object_type, recordAId: r.record_a_id, recordBId: r.record_b_id }));
  }

  /** High-confidence pairs no human has reviewed — only returned when the caller explicitly opts in to auto-merging them. */
  async listHighConfidencePending(portalId: number): Promise<MergeCandidate[]> {
    const result = await this.pool.query(
      `SELECT object_type, record_a_id, record_b_id FROM dedup_candidates WHERE portal_id = $1 AND tier = 'high' AND status = 'pending'`,
      [portalId],
    );
    return result.rows.map((r) => ({ objectType: r.object_type, recordAId: r.record_a_id, recordBId: r.record_b_id }));
  }

  async recordMerge(row: MergeLogRow): Promise<void> {
    await this.pool.query(
      `INSERT INTO merge_log (portal_id, object_type, winner_id, loser_id, triggered_by, field_snapshot) VALUES ($1, $2, $3, $4, $5, $6)`,
      [row.portalId, row.objectType, row.winnerId, row.loserId, row.triggeredBy, JSON.stringify(row.fieldSnapshot)],
    );
  }

  async markMerged(portalId: number, objectType: "COMPANY" | "CONTACT", recordAId: string, recordBId: string): Promise<void> {
    const [a, b] = [recordAId, recordBId].sort();
    await this.pool.query(
      `UPDATE dedup_candidates SET status = 'merged', updated_at = NOW() WHERE portal_id = $1 AND object_type = $2 AND record_a_id = $3 AND record_b_id = $4`,
      [portalId, objectType, a, b],
    );
  }

  async clearCandidates(portalId: number): Promise<number> {
    const result = await this.pool.query(`DELETE FROM dedup_candidates WHERE portal_id = $1`, [portalId]);
    return result.rowCount ?? 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
