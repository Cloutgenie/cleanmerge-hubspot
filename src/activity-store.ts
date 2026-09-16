import type { Pool } from "pg";
import { createPool } from "./db.js";

export interface ActivePortal { portalId: number; lastActivityAt: string }

export interface ActivityStore {
  initialize(): Promise<void>;
  /** Records one real workflow-action execution for a portal. */
  record(portalId: number, transformationType: string): Promise<void>;
  /** Portals with at least one recorded execution within the last `days` days. */
  listActiveSince(days: number): Promise<ActivePortal[]>;
  /** Executions recorded for a portal since the start of the current calendar month (UTC). */
  countThisMonth(portalId: number): Promise<number>;
}

export class PostgresActivityStore implements ActivityStore {
  private readonly pool: Pool;
  constructor(databaseUrl: string) {
    this.pool = createPool(databaseUrl);
  }
  async initialize(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS action_activity (
      id BIGSERIAL PRIMARY KEY,
      portal_id BIGINT NOT NULL,
      transformation_type TEXT NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS action_activity_portal_executed_idx ON action_activity (portal_id, executed_at)`);
  }
  async record(portalId: number, transformationType: string): Promise<void> {
    await this.pool.query("INSERT INTO action_activity (portal_id, transformation_type) VALUES ($1, $2)", [portalId, transformationType]);
  }
  async listActiveSince(days: number): Promise<ActivePortal[]> {
    const result = await this.pool.query<{ portal_id: string; last_activity_at: string }>(
      `SELECT portal_id, MAX(executed_at) AS last_activity_at FROM action_activity
       WHERE executed_at > NOW() - ($1 || ' days')::interval
       GROUP BY portal_id ORDER BY last_activity_at DESC`,
      [days],
    );
    return result.rows.map((r) => ({ portalId: Number(r.portal_id), lastActivityAt: r.last_activity_at }));
  }
  async countThisMonth(portalId: number): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM action_activity WHERE portal_id = $1 AND executed_at >= date_trunc('month', NOW())",
      [portalId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

export class MemoryActivityStore implements ActivityStore {
  private readonly events: { portalId: number; transformationType: string; executedAt: number }[] = [];
  async initialize(): Promise<void> {}
  async record(portalId: number, transformationType: string): Promise<void> {
    this.events.push({ portalId, transformationType, executedAt: Date.now() });
  }
  async listActiveSince(days: number): Promise<ActivePortal[]> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const latestByPortal = new Map<number, number>();
    for (const event of this.events) {
      if (event.executedAt < cutoff) continue;
      const existing = latestByPortal.get(event.portalId);
      if (existing === undefined || event.executedAt > existing) latestByPortal.set(event.portalId, event.executedAt);
    }
    return [...latestByPortal.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([portalId, executedAt]) => ({ portalId, lastActivityAt: new Date(executedAt).toISOString() }));
  }
  async countThisMonth(portalId: number): Promise<number> {
    const now = new Date();
    const startOfMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    return this.events.filter((e) => e.portalId === portalId && e.executedAt >= startOfMonth).length;
  }
}
