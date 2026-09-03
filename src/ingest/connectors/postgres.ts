import { createPool } from "../../db.js";
import type { WarehouseConnector } from "../connector.js";

/**
 * A real, non-mock WarehouseConnector for any Postgres-compatible warehouse (including a plain
 * read-replica, which some customers genuinely have instead of Databricks/Snowflake). Also serves
 * as the local dev/test double for the connector interface, the same role MemoryTokenStore plays
 * for OAuth token storage.
 */
export class PostgresConnector implements WarehouseConnector {
  private readonly pool;
  constructor(connectionUrl: string) {
    this.pool = createPool(connectionUrl);
  }
  async runQuery(sql: string): Promise<Record<string, unknown>[]> {
    const result = await this.pool.query(sql);
    return result.rows;
  }
}
