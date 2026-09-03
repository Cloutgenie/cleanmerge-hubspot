import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabricksConnector } from "../src/ingest/connectors/databricks.js";

const config = { serverHostname: "dbc-test.cloud.databricks.com", httpPath: "/sql/1.0/warehouses/abc123", catalog: "main", schema: "default" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("DatabricksConnector", () => {
  it("maps an immediate SUCCEEDED response's column/row-array shape into objects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      statement_id: "s1",
      status: { state: "SUCCEEDED" },
      manifest: { schema: { columns: [{ name: "name", type_text: "STRING" }, { name: "domain", type_text: "STRING" }] } },
      result: { data_array: [["Acme Corp", "acme.com"], ["Globex", "globex.com"]] },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const connector = new DatabricksConnector(config, "dapi-token");
    const rows = await connector.runQuery("SELECT name, domain FROM companies");

    expect(rows).toEqual([{ name: "Acme Corp", domain: "acme.com" }, { name: "Globex", domain: "globex.com" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://dbc-test.cloud.databricks.com/api/2.0/sql/statements");
    expect(JSON.parse(init.body).warehouse_id).toBe("abc123");
  });

  it("polls until the statement transitions from PENDING to SUCCEEDED", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ statement_id: "s2", status: { state: "PENDING" } }))
      .mockResolvedValueOnce(jsonResponse({ statement_id: "s2", status: { state: "RUNNING" } }))
      .mockResolvedValueOnce(jsonResponse({
        statement_id: "s2",
        status: { state: "SUCCEEDED" },
        manifest: { schema: { columns: [{ name: "id", type_text: "STRING" }] } },
        result: { data_array: [["1"]] },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const connector = new DatabricksConnector(config, "dapi-token");
    const resultPromise = connector.runQuery("SELECT id FROM t");
    await vi.runAllTimersAsync();
    const rows = await resultPromise;

    expect(rows).toEqual([{ id: "1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces the SQL error message when the statement FAILED", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      statement_id: "s3",
      status: { state: "FAILED", error: { message: "TABLE_OR_VIEW_NOT_FOUND" } },
    })));

    const connector = new DatabricksConnector(config, "dapi-token");
    await expect(connector.runQuery("SELECT * FROM missing")).rejects.toThrow("TABLE_OR_VIEW_NOT_FOUND");
  });

  it("raises a distinguishable error when the PAT is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })));

    const connector = new DatabricksConnector(config, "bad-token");
    await expect(connector.runQuery("SELECT 1")).rejects.toThrow(/credential rejected/i);
  });

  it("follows next_chunk_index to assemble a multi-chunk result", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        statement_id: "s4",
        status: { state: "SUCCEEDED" },
        manifest: { schema: { columns: [{ name: "id", type_text: "STRING" }] } },
        result: { data_array: [["1"]], next_chunk_index: 1 },
      }))
      .mockResolvedValueOnce(jsonResponse({ data_array: [["2"]] }));
    vi.stubGlobal("fetch", fetchMock);

    const connector = new DatabricksConnector(config, "dapi-token");
    const rows = await connector.runQuery("SELECT id FROM t");

    expect(rows).toEqual([{ id: "1" }, { id: "2" }]);
    expect(fetchMock.mock.calls[1][0]).toBe("https://dbc-test.cloud.databricks.com/api/2.0/sql/statements/s4/result/chunks/1");
  });
});
