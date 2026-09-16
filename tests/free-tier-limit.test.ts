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
};

function signed(body: object) {
  const timestamp = String(Date.now());
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", config.HUBSPOT_CLIENT_SECRET)
    .update(`POSThttps://example.com/api/hubspot/action${raw}${timestamp}`).digest("base64");
  return { timestamp, signature, raw };
}

function runAction(app: Express, portalId: number) {
  const body = { callbackId: "c1", inputFields: { inputText: "jane-doe", transformationType: "Proper_Case" }, origin: { portalId } };
  const { timestamp, signature, raw } = signed(body);
  return request(app).post("/api/hubspot/action").set("host", "example.com").set("x-forwarded-proto", "https")
    .set("x-hubspot-request-timestamp", timestamp).set("x-hubspot-signature-v3", signature)
    .set("content-type", "application/json").send(raw);
}

describe("Free tier monthly run limit", () => {
  it("allows the first 50 runs in a month and blocks the 51st with a Warehouse Sync nudge", async () => {
    const activityStore = new MemoryActivityStore();
    const app = createApp(config, new MemoryTokenStore(), undefined, undefined, undefined, undefined, activityStore);

    for (let i = 0; i < 50; i++) {
      const response = await runAction(app, 111);
      expect(response.body.outputFields.status).toBe("SUCCESS");
    }

    const blocked = await runAction(app, 111);
    expect(blocked.status).toBe(200);
    expect(blocked.body.outputFields.outputText).toBe("jane-doe");
    expect(blocked.body.outputFields.status).toContain("Free tier limit of 50 runs/month reached");
    expect(blocked.body.outputFields.status).toContain("https://example.com/docs/pricing");
  });

  it("tracks the limit independently per portal", async () => {
    const activityStore = new MemoryActivityStore();
    const app = createApp(config, new MemoryTokenStore(), undefined, undefined, undefined, undefined, activityStore);

    for (let i = 0; i < 50; i++) await runAction(app, 111);

    const otherPortal = await runAction(app, 222);
    expect(otherPortal.body.outputFields.status).toBe("SUCCESS");
  });

  it("does not enforce a limit when no activity store is configured", async () => {
    const app = createApp(config, new MemoryTokenStore());
    for (let i = 0; i < 55; i++) {
      const response = await runAction(app, 111);
      expect(response.body.outputFields.status).toBe("SUCCESS");
    }
  });
});
