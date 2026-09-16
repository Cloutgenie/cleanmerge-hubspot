import type { Pool } from "pg";
import { decryptSecret, encryptSecret } from "./crypto.js";
import { createPool } from "./db.js";
import type { OAuthTokens } from "./types.js";

export interface InstallRow { portalId: number; installedAt: string }

export interface TokenStore {
  initialize(): Promise<void>;
  get(portalId: number): Promise<OAuthTokens | null>;
  set(portalId: number, tokens: OAuthTokens): Promise<void>;
  /** Every portal that has ever completed OAuth — one row per unique portal, re-installs just bump installedAt. */
  listInstalls(): Promise<InstallRow[]>;
}

export class PostgresTokenStore implements TokenStore {
  private readonly pool: Pool;
  constructor(databaseUrl: string, private readonly encryptionKey: string) {
    this.pool = createPool(databaseUrl);
  }
  async initialize(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS hubspot_oauth_tokens (
      portal_id BIGINT PRIMARY KEY,
      encrypted_tokens TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }
  async get(portalId: number): Promise<OAuthTokens | null> {
    const result = await this.pool.query<{ encrypted_tokens: string }>("SELECT encrypted_tokens FROM hubspot_oauth_tokens WHERE portal_id = $1", [portalId]);
    return result.rows[0] ? decryptSecret<OAuthTokens>(result.rows[0].encrypted_tokens, this.encryptionKey) : null;
  }
  async set(portalId: number, tokens: OAuthTokens): Promise<void> {
    await this.pool.query(
      `INSERT INTO hubspot_oauth_tokens (portal_id, encrypted_tokens) VALUES ($1, $2)
       ON CONFLICT (portal_id) DO UPDATE SET encrypted_tokens = EXCLUDED.encrypted_tokens, updated_at = NOW()`,
      [portalId, encryptSecret(tokens, this.encryptionKey)],
    );
  }
  async listInstalls(): Promise<InstallRow[]> {
    const result = await this.pool.query<{ portal_id: string; updated_at: string }>("SELECT portal_id, updated_at FROM hubspot_oauth_tokens ORDER BY updated_at DESC");
    return result.rows.map((r) => ({ portalId: Number(r.portal_id), installedAt: r.updated_at }));
  }
}

export class MemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<number, OAuthTokens>();
  async initialize(): Promise<void> {}
  async get(portalId: number): Promise<OAuthTokens | null> { return this.tokens.get(portalId) ?? null; }
  async set(portalId: number, tokens: OAuthTokens): Promise<void> { this.tokens.set(portalId, tokens); }
  async listInstalls(): Promise<InstallRow[]> {
    return [...this.tokens.keys()].map((portalId) => ({ portalId, installedAt: new Date().toISOString() }));
  }
}
