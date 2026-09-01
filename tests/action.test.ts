import crypto from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { MemoryTokenStore } from "../src/token-store.js";

const config: Config = {
  NODE_ENV: "test", PORT: 3000, PUBLIC_BASE_URL: "https://example.com",
  HUBSPOT_CLIENT_ID: "client", HUBSPOT_CLIENT_SECRET: "secret",
  HUBSPOT_REDIRECT_URI: "https://example.com/oauth/callback", HUBSPOT_SCOPES: "automation",
};
const app = createApp(config, new MemoryTokenStore());

function signed(body: object) {
  const timestamp = String(Date.now());
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", config.HUBSPOT_CLIENT_SECRET).update(`POSThttps://example.com/api/hubspot/action${raw}${timestamp}`).digest("base64");
  return { timestamp, signature, raw };
}

describe("POST /api/hubspot/action", () => {
  it("returns synchronous output fields", async () => {
    const body = { callbackId: "callback-1", inputFields: { inputText: "jane-doe", transformationType: "Proper_Case" } };
    const { timestamp, signature, raw } = signed(body);
    const response = await request(app).post("/api/hubspot/action").set("host", "example.com").set("x-forwarded-proto", "https")
      .set("x-hubspot-request-timestamp", timestamp).set("x-hubspot-signature-v3", signature).set("content-type", "application/json").send(raw);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ outputFields: { outputText: "Jane-Doe", status: "SUCCESS" } });
  });

  it("rejects unsigned requests", async () => {
    const response = await request(app).post("/api/hubspot/action").send({});
    expect(response.status).toBe(401);
  });
});
