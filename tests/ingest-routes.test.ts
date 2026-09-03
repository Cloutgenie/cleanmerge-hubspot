import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp, type IngestDeps } from "../src/app.js";
import type { Config } from "../src/config.js";
import { MemoryTokenStore } from "../src/token-store.js";

const config: Config = {
  NODE_ENV: "test", PORT: 3000, PUBLIC_BASE_URL: "https://example.com",
  HUBSPOT_CLIENT_ID: "client", HUBSPOT_CLIENT_SECRET: "secret",
  HUBSPOT_REDIRECT_URI: "https://example.com/oauth/callback", HUBSPOT_SCOPES: "automation",
  INTERNAL_ADMIN_TOKEN: "admin-token",
};

function buildApp() {
  const ingestStore = {
    createConnection: vi.fn().mockResolvedValue(1),
    listConnections: vi.fn().mockResolvedValue([{ id: 1, portalId: 42, name: "wh", connectorType: "postgres", config: {} }]),
  };
  const ingest = { tokenManager: {}, ingestStore, dedupStore: {} } as unknown as IngestDeps;
  return { app: createApp(config, new MemoryTokenStore(), undefined, ingest), ingestStore };
}

describe("/internal/ingest/connections", () => {
  it("rejects requests without a valid admin bearer token", async () => {
    const { app } = buildApp();
    const response = await request(app).get("/internal/ingest/connections?portalId=42");
    expect(response.status).toBe(401);
  });

  it("rejects a malformed create-connection body", async () => {
    const { app } = buildApp();
    const response = await request(app).post("/internal/ingest/connections").set("authorization", "Bearer admin-token").send({ portalId: 42 });
    expect(response.status).toBe(400);
  });

  it("creates a connection and lists it back", async () => {
    const { app, ingestStore } = buildApp();
    const create = await request(app).post("/internal/ingest/connections").set("authorization", "Bearer admin-token")
      .send({ portalId: 42, name: "wh", connectorType: "postgres", config: { url: "postgres://x" }, credentials: "secret" });
    expect(create.status).toBe(200);
    expect(create.body).toEqual({ id: 1 });
    expect(ingestStore.createConnection).toHaveBeenCalledWith(42, "wh", "postgres", { url: "postgres://x" }, "secret");

    const list = await request(app).get("/internal/ingest/connections?portalId=42").set("authorization", "Bearer admin-token");
    expect(list.status).toBe(200);
    expect(list.body.connections).toHaveLength(1);
  });
});
