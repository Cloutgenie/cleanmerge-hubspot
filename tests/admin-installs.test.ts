import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { MemoryTokenStore } from "../src/token-store.js";

const config: Config = {
  NODE_ENV: "test", PORT: 3000, PUBLIC_BASE_URL: "https://example.com",
  HUBSPOT_CLIENT_ID: "client", HUBSPOT_CLIENT_SECRET: "secret",
  HUBSPOT_REDIRECT_URI: "https://example.com/oauth/callback", HUBSPOT_SCOPES: "automation",
  INTERNAL_ADMIN_TOKEN: "admin-token",
};

describe("GET /internal/admin/installs", () => {
  it("rejects requests without a valid admin bearer token", async () => {
    const tokenStore = new MemoryTokenStore();
    const app = createApp(config, tokenStore);
    const response = await request(app).get("/internal/admin/installs");
    expect(response.status).toBe(401);
  });

  it("counts each unique portal exactly once, including a re-install", async () => {
    const tokenStore = new MemoryTokenStore();
    await tokenStore.set(111, { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 1000, hubId: 111, scopes: [] });
    await tokenStore.set(222, { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 1000, hubId: 222, scopes: [] });
    await tokenStore.set(111, { accessToken: "b", refreshToken: "r2", expiresAt: Date.now() + 1000, hubId: 111, scopes: [] }); // re-install

    const app = createApp(config, tokenStore);
    const response = await request(app).get("/internal/admin/installs").set("authorization", "Bearer admin-token");
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
    expect(response.body.installs.map((i: { portalId: number }) => i.portalId).sort()).toEqual([111, 222]);
  });
});
