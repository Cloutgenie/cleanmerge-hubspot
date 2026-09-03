import type { Pool } from "pg";
import { decryptSecret, encryptSecret } from "./crypto.js";
import { createPool } from "./db.js";
import type { OAuthTokens } from "./types.js";

export interface TokenStore {
  initialize(): Promise<void>;
  get(portalId: number): Promise<OAuthTokens | null>;
  set(portalId: number, tokens: OAuthTokens): Promise<void>;
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
}

export class MemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<number, OAuthTokens>();
  async initialize(): Promise<void> {}
  async get(portalId: number): Promise<OAuthTokens | null> { return this.tokens.get(portalId) ?? null; }
  async set(portalId: number, tokens: OAuthTokens): Promise<void> { this.tokens.set(portalId, tokens); }
}
