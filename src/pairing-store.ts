import type { Pool } from "pg";
import { createPool } from "./db.js";

export interface PairingStore {
  initialize(): Promise<void>;
  create(code: string, hubId: number, expiresAt: Date): Promise<void>;
  /** Atomically claims an unexpired, unclaimed code. Returns its hubId, or null if invalid/expired/already claimed. */
  claim(code: string): Promise<number | null>;
}

export class PostgresPairingStore implements PairingStore {
  private readonly pool: Pool;
  constructor(databaseUrl: string) {
    this.pool = createPool(databaseUrl);
  }
  async initialize(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS pairing_codes (
      code TEXT PRIMARY KEY,
      hub_id BIGINT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      claimed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }
  async create(code: string, hubId: number, expiresAt: Date): Promise<void> {
    await this.pool.query("INSERT INTO pairing_codes (code, hub_id, expires_at) VALUES ($1, $2, $3)", [code, hubId, expiresAt]);
  }
  async claim(code: string): Promise<number | null> {
    const result = await this.pool.query<{ hub_id: string }>(
      `UPDATE pairing_codes SET claimed_at = NOW()
       WHERE code = $1 AND claimed_at IS NULL AND expires_at > NOW()
       RETURNING hub_id`,
      [code],
    );
    return result.rows[0] ? Number(result.rows[0].hub_id) : null;
  }
}

export class MemoryPairingStore implements PairingStore {
  private readonly codes = new Map<string, { hubId: number; expiresAt: Date; claimedAt?: Date }>();
  async initialize(): Promise<void> {}
  async create(code: string, hubId: number, expiresAt: Date): Promise<void> {
    this.codes.set(code, { hubId, expiresAt });
  }
  async claim(code: string): Promise<number | null> {
    const entry = this.codes.get(code);
    if (!entry || entry.claimedAt || entry.expiresAt.getTime() <= Date.now()) return null;
    entry.claimedAt = new Date();
    return entry.hubId;
  }
}
