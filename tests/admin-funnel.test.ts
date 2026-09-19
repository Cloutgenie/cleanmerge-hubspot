import crypto from "node:crypto";
import type { Express } from "express";
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

function runAction(app: Express, portalId: number) {
  const body = { callbackId: "c1", inputFields: { inputText: "x", transformationType: "Proper_Case" }, origin: { portalId } };
  const timestamp = String(Date.now());
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", config.HUBSPOT_CLIENT_SECRET)
    .update(`POSThttps://example.com/api/hubspot/action${raw}${timestamp}`).digest("base64");
  return request(app).post("/api/hubspot/action").set("host", "example.com").set("x-forwarded-proto", "https")
    .set("x-hubspot-request-timestamp", timestamp).set("x-hubspot-signature-v3", signature)
    .set("content-type", "application/json").send(raw);
}

describe("GET /internal/admin/funnel", () => {
  it("rejects requests without a valid admin bearer token", async () => {
    const app = createApp(config, new MemoryTokenStore());
    const response = await request(app).get("/internal/admin/funnel");
    expect(response.status).toBe(401);
  });

  it("buckets installed portals into activation stages, ignoring uninstalled portals with activity", async () => {
    const tokenStore = new MemoryTokenStore();
    await tokenStore.set(111, { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 1000, hubId: 111, scopes: [] }); // installed, 12 runs
    await tokenStore.set(222, { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 1000, hubId: 222, scopes: [] }); // installed, 1 run
    await tokenStore.set(333, { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 1000, hubId: 333, scopes: [] }); // installed, never ran
    await tokenStore.set(444, { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 1000, hubId: 444, scopes: [] }); // installed, hits the free-tier cap

    const activityStore = new MemoryActivityStore();
    const app = createApp(config, tokenStore, undefined, undefined, undefined, undefined, activityStore);

    for (let i = 0; i < 12; i++) await runAction(app, 111);
    await runAction(app, 222);
    for (let i = 0; i < 50; i++) await runAction(app, 444);
    await runAction(app, 999); // never installed — must not count anywhere

    const response = await request(app).get("/internal/admin/funnel").set("authorization", "Bearer admin-token");
    expect(response.status).toBe(200);
    expect(response.body.stages).toEqual({ installed: 4, everRan: 3, ran10Plus: 2, hitFreeCap: 1 });
  });
});
