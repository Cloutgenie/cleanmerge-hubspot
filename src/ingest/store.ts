import type { Pool } from "pg";
import { createPool } from "../db.js";
import { decryptSecret, encryptSecret } from "../crypto.js";
import type { TransformationType } from "../types.js";

export type ObjectType = "COMPANY" | "CONTACT";

export interface FieldMappingEntry {
  sourceColumn: string;
  hubspotProperty: string;
  transformationType?: TransformationType;
  createIfMissing?: boolean;
}

export interface WarehouseConnectionRow {
  id: number;
  portalId: number;
  name: string;
  connectorType: string;
  config: Record<string, unknown>;
  credentials: string; // decrypted PAT/secret
}

export interface FieldMappingRow {
  id: number;
  connectionId: number;
  objectType: ObjectType;
  sourceQuery: string;
  mappings: FieldMappingEntry[];
  matchKeyColumns: string[];
  cronSchedule: string | null;
  enabled: boolean;
}

export interface IngestRunCounts {
  rowsRead: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsQueuedForReview: number;
  rowsErrored: number;
  errors: Array<{ rowIndex: number; error: string }>;
}

export interface IngestRunSummaryRow {
  id: number;
  portalId: number;
  connectionId: number;
  objectType: ObjectType;
  triggeredBy: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  counts: Omit<IngestRunCounts, "errors">;
}

const MAX_LOGGED_ERRORS = 50;

export class IngestStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string, private readonly encryptionKey: string) {
    this.pool = createPool(databaseUrl);
  }

  async initialize(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS warehouse_connections (
      id BIGSERIAL PRIMARY KEY,
      portal_id BIGINT NOT NULL,
      name TEXT NOT NULL,
      connector_type TEXT NOT NULL DEFAULT 'databricks_sql',
      config JSONB NOT NULL,
      encrypted_credentials TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (portal_id, name)
    )`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS field_mappings (
      id BIGSERIAL PRIMARY KEY,
      connection_id BIGINT NOT NULL REFERENCES warehouse_connections(id) ON DELETE CASCADE,
      object_type TEXT NOT NULL,
      source_query TEXT NOT NULL,
      mappings JSONB NOT NULL,
      match_key_columns JSONB NOT NULL,
      cron_schedule TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (connection_id, object_type)
    )`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS ingest_runs (
      id BIGSERIAL PRIMARY KEY,
      portal_id BIGINT NOT NULL,
      connection_id BIGINT NOT NULL REFERENCES warehouse_connections(id),
      object_type TEXT NOT NULL,
      triggered_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      rows_read INTEGER NOT NULL DEFAULT 0,
      rows_created INTEGER NOT NULL DEFAULT 0,
      rows_updated INTEGER NOT NULL DEFAULT 0,
      rows_queued_for_review INTEGER NOT NULL DEFAULT 0,
      rows_errored INTEGER NOT NULL DEFAULT 0,
      error_summary JSONB,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    )`);
  }

  async createConnection(portalId: number, name: string, connectorType: string, config: Record<string, unknown>, credentials: string): Promise<number> {
    // pg returns bigint columns (including BIGSERIAL ids) as strings to avoid precision loss —
    // coerce back to number here so every caller can rely on the number type this returns.
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO warehouse_connections (portal_id, name, connector_type, config, encrypted_credentials)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [portalId, name, connectorType, JSON.stringify(config), encryptSecret(credentials, this.encryptionKey)],
    );
    return Number(result.rows[0].id);
  }

  async updateConnection(id: number, config?: Record<string, unknown>, credentials?: string): Promise<void> {
    if (config) await this.pool.query(`UPDATE warehouse_connections SET config = $2, updated_at = NOW() WHERE id = $1`, [id, JSON.stringify(config)]);
    if (credentials) await this.pool.query(`UPDATE warehouse_connections SET encrypted_credentials = $2, updated_at = NOW() WHERE id = $1`, [id, encryptSecret(credentials, this.encryptionKey)]);
  }

  /** Removes the connection, its field mappings (ON DELETE CASCADE), and its run history. Returns false if no connection with that id belonged to the portal. */
  async deleteConnection(id: number, portalId: number): Promise<boolean> {
    const owned = await this.pool.query(`SELECT 1 FROM warehouse_connections WHERE id = $1 AND portal_id = $2`, [id, portalId]);
    if (owned.rowCount === 0) return false;
    await this.pool.query(`DELETE FROM ingest_runs WHERE connection_id = $1`, [id]);
    await this.pool.query(`DELETE FROM warehouse_connections WHERE id = $1`, [id]);
    return true;
  }

  /** Never includes credentials — for listing/display only. */
  async listConnections(portalId: number): Promise<Array<Omit<WarehouseConnectionRow, "credentials">>> {
    const result = await this.pool.query(`SELECT id, portal_id, name, connector_type, config FROM warehouse_connections WHERE portal_id = $1 ORDER BY name`, [portalId]);
    return result.rows.map((r) => ({ id: Number(r.id), portalId: Number(r.portal_id), name: r.name, connectorType: r.connector_type, config: r.config }));
  }

  /** Includes decrypted credentials — internal engine use only, never returned from an HTTP response. */
  async getConnection(id: number): Promise<WarehouseConnectionRow | null> {
    const result = await this.pool.query(`SELECT id, portal_id, name, connector_type, config, encrypted_credentials FROM warehouse_connections WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      portalId: Number(row.portal_id),
      name: row.name,
      connectorType: row.connector_type,
      config: row.config,
      credentials: decryptSecret<string>(row.encrypted_credentials, this.encryptionKey),
    };
  }

  async upsertMapping(row: Omit<FieldMappingRow, "id">): Promise<void> {
    await this.pool.query(
      `INSERT INTO field_mappings (connection_id, object_type, source_query, mappings, match_key_columns, cron_schedule, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (connection_id, object_type)
       DO UPDATE SET source_query = EXCLUDED.source_query, mappings = EXCLUDED.mappings,
         match_key_columns = EXCLUDED.match_key_columns, cron_schedule = EXCLUDED.cron_schedule,
         enabled = EXCLUDED.enabled, updated_at = NOW()`,
      [row.connectionId, row.objectType, row.sourceQuery, JSON.stringify(row.mappings), JSON.stringify(row.matchKeyColumns), row.cronSchedule, row.enabled],
    );
  }

  async listMappings(connectionId: number): Promise<FieldMappingRow[]> {
    const result = await this.pool.query(`SELECT * FROM field_mappings WHERE connection_id = $1 ORDER BY object_type`, [connectionId]);
    return result.rows.map(mapMappingRow);
  }

  async listEnabledMappings(connectionId: number): Promise<FieldMappingRow[]> {
    const result = await this.pool.query(`SELECT * FROM field_mappings WHERE connection_id = $1 AND enabled = true ORDER BY object_type`, [connectionId]);
    return result.rows.map(mapMappingRow);
  }

  async startRun(portalId: number, connectionId: number, objectType: ObjectType, triggeredBy: string): Promise<number> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO ingest_runs (portal_id, connection_id, object_type, triggered_by) VALUES ($1, $2, $3, $4) RETURNING id`,
      [portalId, connectionId, objectType, triggeredBy],
    );
    return Number(result.rows[0].id);
  }

  async finishRun(runId: number, status: "succeeded" | "failed", counts: IngestRunCounts): Promise<void> {
    await this.pool.query(
      `UPDATE ingest_runs SET status = $2, rows_read = $3, rows_created = $4, rows_updated = $5,
         rows_queued_for_review = $6, rows_errored = $7, error_summary = $8, finished_at = NOW()
       WHERE id = $1`,
      [runId, status, counts.rowsRead, counts.rowsCreated, counts.rowsUpdated, counts.rowsQueuedForReview, counts.rowsErrored, JSON.stringify(counts.errors.slice(0, MAX_LOGGED_ERRORS))],
    );
  }

  async listRuns(portalId: number, connectionId?: number, limit = 50): Promise<IngestRunSummaryRow[]> {
    const result = connectionId
      ? await this.pool.query(`SELECT * FROM ingest_runs WHERE portal_id = $1 AND connection_id = $2 ORDER BY started_at DESC LIMIT $3`, [portalId, connectionId, limit])
      : await this.pool.query(`SELECT * FROM ingest_runs WHERE portal_id = $1 ORDER BY started_at DESC LIMIT $2`, [portalId, limit]);
    return result.rows.map((r) => ({
      id: Number(r.id),
      portalId: Number(r.portal_id),
      connectionId: Number(r.connection_id),
      objectType: r.object_type,
      triggeredBy: r.triggered_by,
      status: r.status,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      counts: {
        rowsRead: r.rows_read,
        rowsCreated: r.rows_created,
        rowsUpdated: r.rows_updated,
        rowsQueuedForReview: r.rows_queued_for_review,
        rowsErrored: r.rows_errored,
      },
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function mapMappingRow(r: Record<string, unknown>): FieldMappingRow {
  return {
    id: Number(r.id),
    connectionId: Number(r.connection_id),
    objectType: r.object_type as ObjectType,
    sourceQuery: r.source_query as string,
    mappings: r.mappings as FieldMappingEntry[],
    matchKeyColumns: r.match_key_columns as string[],
    cronSchedule: r.cron_schedule as string | null,
    enabled: r.enabled as boolean,
  };
}
