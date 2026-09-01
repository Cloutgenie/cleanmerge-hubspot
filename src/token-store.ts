import crypto from "node:crypto";
import { Pool } from "pg";
import type { OAuthTokens } from "./types.js";

export interface TokenStore {
  initialize(): Promise<void>;
  get(portalId: number): Promise<OAuthTokens | null>;
  set(portalId: number, tokens: OAuthTokens): Promise<void>;
}

function keyFromSecret(secret: string): Buffer {
  const decoded = Buffer.from(secret, "base64");
  return decoded.length === 32 ? decoded : crypto.createHash("sha256").update(secret).digest();
}

function encrypt(value: OAuthTokens, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value: string, secret: string): OAuthTokens {
  const [iv, tag, ciphertext] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as OAuthTokens;
}

export class PostgresTokenStore implements TokenStore {
  private readonly pool: Pool;
  constructor(databaseUrl: string, private readonly encryptionKey: string) {
    const isUnencryptedInternal = databaseUrl.includes("localhost") || databaseUrl.includes(".railway.internal");
    this.pool = new Pool({ connectionString: databaseUrl, ssl: isUnencryptedInternal ? false : { rejectUnauthorized: false } });
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
    return result.rows[0] ? decrypt(result.rows[0].encrypted_tokens, this.encryptionKey) : null;
  }
  async set(portalId: number, tokens: OAuthTokens): Promise<void> {
    await this.pool.query(
      `INSERT INTO hubspot_oauth_tokens (portal_id, encrypted_tokens) VALUES ($1, $2)
       ON CONFLICT (portal_id) DO UPDATE SET encrypted_tokens = EXCLUDED.encrypted_tokens, updated_at = NOW()`,
      [portalId, encrypt(tokens, this.encryptionKey)],
    );
  }
}

export class MemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<number, OAuthTokens>();
  async initialize(): Promise<void> {}
  async get(portalId: number): Promise<OAuthTokens | null> { return this.tokens.get(portalId) ?? null; }
  async set(portalId: number, tokens: OAuthTokens): Promise<void> { this.tokens.set(portalId, tokens); }
}
