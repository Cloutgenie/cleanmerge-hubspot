import type { Pool } from "pg";
import { createPool } from "../db.js";
import type { DedupTier } from "./scoring.js";

export interface DedupCandidateRow {
  portalId: number;
  objectType: "COMPANY" | "CONTACT";
  recordAId: string;
  recordBId: string;
  score: number;
  tier: DedupTier;
  breakdown: Record<string, number>;
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
  }

  async upsertCandidate(row: DedupCandidateRow): Promise<void> {
    const [recordAId, recordBId] = [row.recordAId, row.recordBId].sort();
    await this.pool.query(
      `INSERT INTO dedup_candidates (portal_id, object_type, record_a_id, record_b_id, score, tier, breakdown)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (portal_id, object_type, record_a_id, record_b_id)
       DO UPDATE SET score = EXCLUDED.score, tier = EXCLUDED.tier, breakdown = EXCLUDED.breakdown, updated_at = NOW()`,
      [row.portalId, row.objectType, recordAId, recordBId, row.score, row.tier, JSON.stringify(row.breakdown)],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
