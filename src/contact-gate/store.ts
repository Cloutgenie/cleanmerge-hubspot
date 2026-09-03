import type { Pool } from "pg";
import { createPool } from "../db.js";

export type ContactGatePolicy = "never_create" | "allowlist_only" | "quarantine" | "create";
export type AllowlistMatchType = "domain" | "email";
export type QuarantineStatus = "pending" | "promoted" | "discarded";
export type QuarantineAction = "logged_only" | "deleted";

export interface PolicyRow {
  portalId: number;
  policy: ContactGatePolicy;
  dryRun: boolean;
}

export interface QuarantineRow {
  id: number;
  portalId: number;
  contactId: string;
  email: string;
  sourceLabel: string | null;
  status: QuarantineStatus;
  actionTaken: QuarantineAction;
  createdAt: string;
}

export interface AuditEntry {
  portalId: number;
  actor: string;
  action: string;
  target: Record<string, unknown>;
}

const DEFAULT_POLICY: ContactGatePolicy = "quarantine";
const DEFAULT_DRY_RUN = true;

export class ContactGateStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = createPool(databaseUrl);
  }

  async initialize(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS contact_gate_policy (
      portal_id BIGINT PRIMARY KEY,
      policy TEXT NOT NULL DEFAULT '${DEFAULT_POLICY}',
      dry_run BOOLEAN NOT NULL DEFAULT ${DEFAULT_DRY_RUN},
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS contact_gate_allowlist (
      id BIGSERIAL PRIMARY KEY,
      portal_id BIGINT NOT NULL,
      match_type TEXT NOT NULL,
      match_value TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (portal_id, match_type, match_value)
    )`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS contact_gate_suppressions (
      id BIGSERIAL PRIMARY KEY,
      portal_id BIGINT NOT NULL,
      email TEXT NOT NULL,
      suppressed_until TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (portal_id, email)
    )`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS contact_gate_quarantine (
      id BIGSERIAL PRIMARY KEY,
      portal_id BIGINT NOT NULL,
      contact_id TEXT NOT NULL,
      email TEXT NOT NULL,
      source_label TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      action_taken TEXT NOT NULL,
      raw_payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (portal_id, contact_id)
    )`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS contact_gate_audit_log (
      id BIGSERIAL PRIMARY KEY,
      portal_id BIGINT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }

  /** Always returns a row — an un-configured portal gets the safe default (quarantine + dry-run). */
  async getPolicy(portalId: number): Promise<PolicyRow> {
    const result = await this.pool.query(`SELECT policy, dry_run FROM contact_gate_policy WHERE portal_id = $1`, [portalId]);
    const row = result.rows[0];
    if (!row) return { portalId, policy: DEFAULT_POLICY, dryRun: DEFAULT_DRY_RUN };
    return { portalId, policy: row.policy, dryRun: row.dry_run };
  }

  async setPolicy(portalId: number, policy: ContactGatePolicy, dryRun: boolean): Promise<void> {
    await this.pool.query(
      `INSERT INTO contact_gate_policy (portal_id, policy, dry_run) VALUES ($1, $2, $3)
       ON CONFLICT (portal_id) DO UPDATE SET policy = EXCLUDED.policy, dry_run = EXCLUDED.dry_run, updated_at = NOW()`,
      [portalId, policy, dryRun],
    );
  }

  async isAllowlisted(portalId: number, email: string): Promise<boolean> {
    const domain = email.split("@")[1]?.toLocaleLowerCase("en-US") ?? "";
    const result = await this.pool.query(
      `SELECT 1 FROM contact_gate_allowlist WHERE portal_id = $1
       AND ((match_type = 'email' AND match_value = $2) OR (match_type = 'domain' AND match_value = $3)) LIMIT 1`,
      [portalId, email.toLocaleLowerCase("en-US"), domain],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async addToAllowlist(portalId: number, matchType: AllowlistMatchType, matchValue: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO contact_gate_allowlist (portal_id, match_type, match_value) VALUES ($1, $2, $3)
       ON CONFLICT (portal_id, match_type, match_value) DO NOTHING`,
      [portalId, matchType, matchValue.toLocaleLowerCase("en-US")],
    );
  }

  async listAllowlist(portalId: number): Promise<Array<{ matchType: AllowlistMatchType; matchValue: string }>> {
    const result = await this.pool.query(`SELECT match_type, match_value FROM contact_gate_allowlist WHERE portal_id = $1 ORDER BY match_value`, [portalId]);
    return result.rows.map((r) => ({ matchType: r.match_type, matchValue: r.match_value }));
  }

  async isSuppressed(portalId: number, email: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM contact_gate_suppressions WHERE portal_id = $1 AND email = $2 AND suppressed_until > NOW() LIMIT 1`,
      [portalId, email.toLocaleLowerCase("en-US")],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async suppress(portalId: number, email: string, days: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO contact_gate_suppressions (portal_id, email, suppressed_until) VALUES ($1, $2, NOW() + ($3 || ' days')::INTERVAL)
       ON CONFLICT (portal_id, email) DO UPDATE SET suppressed_until = EXCLUDED.suppressed_until, updated_at = NOW()`,
      [portalId, email.toLocaleLowerCase("en-US"), days],
    );
  }

  async recordQuarantine(row: {
    portalId: number; contactId: string; email: string; sourceLabel: string | null; actionTaken: QuarantineAction; rawPayload: unknown;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO contact_gate_quarantine (portal_id, contact_id, email, source_label, action_taken, raw_payload, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       ON CONFLICT (portal_id, contact_id) DO UPDATE SET action_taken = EXCLUDED.action_taken, raw_payload = EXCLUDED.raw_payload, updated_at = NOW()`,
      [row.portalId, row.contactId, row.email, row.sourceLabel, row.actionTaken, JSON.stringify(row.rawPayload)],
    );
  }

  async listPending(portalId: number): Promise<QuarantineRow[]> {
    const result = await this.pool.query(
      `SELECT id, portal_id, contact_id, email, source_label, status, action_taken, created_at
       FROM contact_gate_quarantine WHERE portal_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
      [portalId],
    );
    return result.rows.map(mapQuarantineRow);
  }

  async getQuarantineById(id: number): Promise<QuarantineRow | null> {
    const result = await this.pool.query(
      `SELECT id, portal_id, contact_id, email, source_label, status, action_taken, created_at FROM contact_gate_quarantine WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapQuarantineRow(result.rows[0]) : null;
  }

  async markQuarantineStatus(id: number, status: QuarantineStatus): Promise<void> {
    await this.pool.query(`UPDATE contact_gate_quarantine SET status = $2, updated_at = NOW() WHERE id = $1`, [id, status]);
  }

  async recordAudit(entry: AuditEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO contact_gate_audit_log (portal_id, actor, action, target) VALUES ($1, $2, $3, $4)`,
      [entry.portalId, entry.actor, entry.action, JSON.stringify(entry.target)],
    );
  }

  async listAudit(portalId: number, limit = 50): Promise<Array<{ actor: string; action: string; target: unknown; createdAt: string }>> {
    const result = await this.pool.query(
      `SELECT actor, action, target, created_at FROM contact_gate_audit_log WHERE portal_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [portalId, limit],
    );
    return result.rows.map((r) => ({ actor: r.actor, action: r.action, target: r.target, createdAt: r.created_at }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function mapQuarantineRow(r: Record<string, unknown>): QuarantineRow {
  return {
    id: Number(r.id),
    portalId: Number(r.portal_id),
    contactId: r.contact_id as string,
    email: r.email as string,
    sourceLabel: r.source_label as string | null,
    status: r.status as QuarantineStatus,
    actionTaken: r.action_taken as QuarantineAction,
    createdAt: r.created_at as string,
  };
}
