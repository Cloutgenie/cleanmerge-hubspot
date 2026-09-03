import type { WarehouseConnector } from "../connector.js";

export interface DatabricksConfig {
  serverHostname: string; // e.g. "dbc-abc123.cloud.databricks.com" (no scheme)
  httpPath: string; // e.g. "/sql/1.0/warehouses/abcdef0123456789" — identifies the SQL warehouse
  catalog?: string;
  schema?: string;
}

interface StatementColumn {
  name: string;
  type_text: string;
}

interface StatementStatus {
  state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "CLOSED";
  error?: { message?: string };
}

interface StatementResponse {
  statement_id: string;
  status: StatementStatus;
  manifest?: { schema: { columns: StatementColumn[] } };
  result?: { data_array?: string[][]; next_chunk_index?: number };
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 60; // ~2 minutes total, in addition to the initial wait_timeout budget below

function parseWarehouseId(httpPath: string): string {
  const match = /\/warehouses\/([a-zA-Z0-9]+)/.exec(httpPath);
  if (!match) throw new Error(`Could not parse a warehouse id out of httpPath "${httpPath}"`);
  return match[1];
}

function rowsFromChunk(columns: StatementColumn[], dataArray: string[][] | undefined): Record<string, unknown>[] {
  if (!dataArray) return [];
  return dataArray.map((row) => Object.fromEntries(columns.map((col, i) => [col.name, row[i] ?? null])));
}

/**
 * Talks to Databricks SQL Warehouses' REST Statement Execution API over plain fetch() — deliberately
 * not the native `databricks-sql-node` driver, which pulls in a Thrift-based binary client that's a
 * much heavier, more fragile Railway build dependency than anything else in this repo. This API is
 * HTTPS + JSON + Bearer auth, matching how hubspot-client.ts and ai-judgment.ts already call out.
 */
export class DatabricksConnector implements WarehouseConnector {
  constructor(private readonly config: DatabricksConfig, private readonly personalAccessToken: string) {}

  async runQuery(sql: string): Promise<Record<string, unknown>[]> {
    const baseUrl = `https://${this.config.serverHostname}/api/2.0/sql/statements`;
    const initial = await this.request(baseUrl, {
      method: "POST",
      body: JSON.stringify({
        statement: sql,
        warehouse_id: parseWarehouseId(this.config.httpPath),
        catalog: this.config.catalog,
        schema: this.config.schema,
        wait_timeout: "30s",
        disposition: "INLINE",
        format: "JSON_ARRAY",
      }),
    });

    let statement = await this.awaitCompletion(baseUrl, initial);
    if (statement.status.state === "FAILED") {
      throw new Error(`Databricks statement failed: ${statement.status.error?.message ?? "unknown error"}`);
    }
    if (statement.status.state !== "SUCCEEDED") {
      throw new Error(`Databricks statement ended in unexpected state "${statement.status.state}"`);
    }

    const columns = statement.manifest?.schema.columns ?? [];
    const rows = rowsFromChunk(columns, statement.result?.data_array);

    // Additional result chunks, for result sets too large for a single INLINE chunk.
    let nextChunkIndex = statement.result?.next_chunk_index;
    while (nextChunkIndex !== undefined) {
      const chunk = await this.request(`${baseUrl}/${statement.statement_id}/result/chunks/${nextChunkIndex}`, { method: "GET" });
      rows.push(...rowsFromChunk(columns, (chunk as unknown as { data_array?: string[][] }).data_array));
      nextChunkIndex = (chunk as unknown as { next_chunk_index?: number }).next_chunk_index;
    }

    return rows;
  }

  private async awaitCompletion(baseUrl: string, statement: StatementResponse): Promise<StatementResponse> {
    let current = statement;
    let polls = 0;
    while (current.status.state === "PENDING" || current.status.state === "RUNNING") {
      if (polls >= MAX_POLLS) throw new Error(`Databricks statement ${current.statement_id} did not complete within the poll budget`);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      current = await this.request(`${baseUrl}/${current.statement_id}`, { method: "GET" });
      polls++;
    }
    return current;
  }

  private async request(url: string, init: { method: "GET" | "POST"; body?: string }): Promise<StatementResponse> {
    const response = await fetch(url, {
      method: init.method,
      headers: {
        authorization: `Bearer ${this.personalAccessToken}`,
        "content-type": "application/json",
      },
      body: init.body,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Databricks credential rejected (${response.status}) — PAT likely expired or revoked`);
    }
    if (!response.ok) throw new Error(`Databricks request to ${url} failed (${response.status}): ${await response.text()}`);
    return (await response.json()) as StatementResponse;
  }
}
