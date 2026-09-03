import crypto from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/dedup/hubspot-client.js", async () => {
  const actual = await vi.importActual<typeof import("../src/dedup/hubspot-client.js")>("../src/dedup/hubspot-client.js");
  return { ...actual, getObject: vi.fn().mockResolvedValue({ id: "500", properties: { email: "a@unknown.com", hs_object_source_label: "Conversations" } }) };
});

import { createApp, type ContactGateDeps } from "../src/app.js";
import type { Config } from "../src/config.js";
import { MemoryTokenStore } from "../src/token-store.js";

const config: Config = {
  NODE_ENV: "test", PORT: 3000, PUBLIC_BASE_URL: "https://example.com",
  HUBSPOT_CLIENT_ID: "client", HUBSPOT_CLIENT_SECRET: "secret",
  HUBSPOT_REDIRECT_URI: "https://example.com/oauth/callback", HUBSPOT_SCOPES: "automation",
  INTERNAL_ADMIN_TOKEN: "admin-token",
};

function signed(body: unknown, path: string) {
  const timestamp = String(Date.now());
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", config.HUBSPOT_CLIENT_SECRET).update(`POSThttps://example.com${path}${raw}${timestamp}`).digest("base64");
  return { timestamp, signature, raw };
}

function buildApp() {
  const contactGateStore = {
    getPolicy: vi.fn().mockResolvedValue({ portalId: 42, policy: "quarantine", dryRun: true }),
    isAllowlisted: vi.fn().mockResolvedValue(false),
    isSuppressed: vi.fn().mockResolvedValue(false),
    recordQuarantine: vi.fn().mockResolvedValue(undefined),
  };
  const tokenManager = { getAccessToken: vi.fn().mockResolvedValue("access-token") };
  const contactGate = { tokenManager, contactGateStore } as unknown as ContactGateDeps;
  return { app: createApp(config, new MemoryTokenStore(), undefined, undefined, contactGate), contactGateStore };
}

describe("POST /webhooks/hubspot", () => {
  it("rejects a request without a valid HubSpot signature", async () => {
    const { app } = buildApp();
    const response = await request(app).post("/webhooks/hubspot").send([{ subscriptionType: "object.creation", objectType: "contact", portalId: 42, objectId: "500" }]);
    expect(response.status).toBe(401);
  });

  it("rejects a request whose signature doesn't match a tampered body", async () => {
    const { app } = buildApp();
    const body = [{ subscriptionType: "object.creation", objectType: "contact", portalId: 42, objectId: "500" }];
    const { timestamp, signature } = signed(body, "/webhooks/hubspot");
    const tampered = JSON.stringify([{ subscriptionType: "object.creation", objectType: "contact", portalId: 42, objectId: "999" }]);
    const response = await request(app).post("/webhooks/hubspot").set("host", "example.com").set("x-forwarded-proto", "https")
      .set("x-hubspot-request-timestamp", timestamp).set("x-hubspot-signature-v3", signature).set("content-type", "application/json").send(tampered);
    expect(response.status).toBe(401);
  });

  it("accepts a validly-signed contact-creation event and records a quarantine entry", async () => {
    const { app, contactGateStore } = buildApp();
    const body = [{ subscriptionType: "object.creation", objectType: "contact", portalId: 42, objectId: "500" }];
    const { timestamp, signature, raw } = signed(body, "/webhooks/hubspot");
    const response = await request(app).post("/webhooks/hubspot").set("host", "example.com").set("x-forwarded-proto", "https")
      .set("x-hubspot-request-timestamp", timestamp).set("x-hubspot-signature-v3", signature).set("content-type", "application/json").send(raw);
    expect(response.status).toBe(200);
    // The handler acks immediately then processes events async; give the in-flight promise a tick.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(contactGateStore.getPolicy).toHaveBeenCalledWith(42);
    expect(contactGateStore.recordQuarantine).toHaveBeenCalledWith(expect.objectContaining({ contactId: "500", actionTaken: "logged_only" }));
  });
});
