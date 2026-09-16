import crypto from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { MemoryActivityStore } from "../src/activity-store.js";
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

  it("counts active installs from real workflow-action executions, excluding uninstalled and excluded portals", async () => {
    const tokenStore = new MemoryTokenStore();
    await tokenStore.set(111, { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 1000, hubId: 111, scopes: [] });
    await tokenStore.set(222, { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 1000, hubId: 222, scopes: [] });
    await tokenStore.set(333, { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 1000, hubId: 333, scopes: [] });

    const activityStore = new MemoryActivityStore();
    const app = createApp(config, tokenStore, undefined, undefined, undefined, undefined, activityStore);

    function signedAction(body: object) {
      const timestamp = String(Date.now());
      const raw = JSON.stringify(body);
      const signature = crypto.createHmac("sha256", config.HUBSPOT_CLIENT_SECRET)
        .update(`POSThttps://example.com/api/hubspot/action${raw}${timestamp}`).digest("base64");
      return { timestamp, signature, raw };
    }
    async function runAction(portalId: number) {
      const body = { callbackId: "c1", inputFields: { inputText: "x", transformationType: "Proper_Case" }, origin: { portalId } };
      const { timestamp, signature, raw } = signedAction(body);
      await request(app).post("/api/hubspot/action").set("host", "example.com").set("x-forwarded-proto", "https")
        .set("x-hubspot-request-timestamp", timestamp).set("x-hubspot-signature-v3", signature)
        .set("content-type", "application/json").send(raw);
    }

    // Portal 111 and 222 have real activity; 333 installed but never used the action; 444 has
    // activity but was never installed (e.g. since uninstalled) and must not count as active.
    await runAction(111);
    await runAction(222);
    await runAction(444);

    const response = await request(app).get("/internal/admin/installs")
      .query({ excludePortalIds: "222" }).set("authorization", "Bearer admin-token");
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(3);
    expect(response.body.activeInstalls.count).toBe(1);
    expect(response.body.activeInstalls.portals.map((p: { portalId: number }) => p.portalId)).toEqual([111]);
  });
});
