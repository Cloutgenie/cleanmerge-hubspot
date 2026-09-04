import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp, type ContactGateDeps } from "../src/app.js";
import type { Config } from "../src/config.js";
import { MemoryPairingStore } from "../src/pairing-store.js";
import { signSessionToken } from "../src/session.js";
import { MemoryTokenStore } from "../src/token-store.js";

const config: Config = {
  NODE_ENV: "test", PORT: 3000, PUBLIC_BASE_URL: "https://example.com",
  HUBSPOT_CLIENT_ID: "client", HUBSPOT_CLIENT_SECRET: "secret",
  HUBSPOT_REDIRECT_URI: "https://example.com/oauth/callback", HUBSPOT_SCOPES: "automation",
  INTERNAL_ADMIN_TOKEN: "admin-token",
};

function buildApp() {
  const pairingStore = new MemoryPairingStore();
  const contactGateStore = {
    setPolicy: vi.fn().mockResolvedValue(undefined),
    getPolicy: vi.fn().mockResolvedValue({ portalId: 42, policy: "quarantine", dryRun: true }),
    recordAudit: vi.fn().mockResolvedValue(undefined),
  };
  const contactGate = { tokenManager: {}, contactGateStore } as unknown as ContactGateDeps;
  const app = createApp(config, new MemoryTokenStore(), undefined, undefined, contactGate, pairingStore);
  return { app, pairingStore, contactGateStore };
}

describe("POST /internal/pairing/claim", () => {
  it("rejects a code that was never issued", async () => {
    const { app } = buildApp();
    const res = await request(app).post("/internal/pairing/claim").send({ code: "AAAA-BBBB" });
    expect(res.status).toBe(400);
  });

  it("claims a valid code exactly once", async () => {
    const { app, pairingStore } = buildApp();
    await pairingStore.create("AAAA-BBBB", 42, new Date(Date.now() + 60_000));

    const first = await request(app).post("/internal/pairing/claim").send({ code: "AAAA-BBBB" });
    expect(first.status).toBe(200);
    expect(first.body.portalId).toBe(42);
    expect(typeof first.body.sessionToken).toBe("string");

    const second = await request(app).post("/internal/pairing/claim").send({ code: "AAAA-BBBB" });
    expect(second.status).toBe(400);
  });

  it("rejects an expired code", async () => {
    const { app, pairingStore } = buildApp();
    await pairingStore.create("CCCC-DDDD", 42, new Date(Date.now() - 1000));
    const res = await request(app).post("/internal/pairing/claim").send({ code: "CCCC-DDDD" });
    expect(res.status).toBe(400);
  });
});

describe("PUT /internal/contact-gate/policy/self-serve", () => {
  it("rejects a request with no auth at all", async () => {
    const { app } = buildApp();
    const res = await request(app).put("/internal/contact-gate/policy/self-serve").send({ portalId: 42, policy: "quarantine" });
    expect(res.status).toBe(401);
  });

  it("rejects a session token scoped to a different portal", async () => {
    const { app } = buildApp();
    const token = signSessionToken(config, 999);
    const res = await request(app).put("/internal/contact-gate/policy/self-serve")
      .set("authorization", `Bearer ${token}`).send({ portalId: 42, policy: "quarantine" });
    expect(res.status).toBe(401);
  });

  it("accepts a session token matching the claimed portal, and always forces dryRun true", async () => {
    const { app, contactGateStore } = buildApp();
    const token = signSessionToken(config, 42);
    const res = await request(app).put("/internal/contact-gate/policy/self-serve")
      .set("authorization", `Bearer ${token}`).send({ portalId: 42, policy: "quarantine" });
    expect(res.status).toBe(200);
    expect(contactGateStore.setPolicy).toHaveBeenCalledWith(42, "quarantine", true);
  });

  it("ignores any dryRun value the caller sends — the field isn't even read", async () => {
    const { app, contactGateStore } = buildApp();
    const token = signSessionToken(config, 42);
    const res = await request(app).put("/internal/contact-gate/policy/self-serve")
      .set("authorization", `Bearer ${token}`).send({ portalId: 42, policy: "quarantine", dryRun: false });
    expect(res.status).toBe(200);
    expect(contactGateStore.setPolicy).toHaveBeenCalledWith(42, "quarantine", true);
  });

  it("still works with the admin token, for any portal", async () => {
    const { app, contactGateStore } = buildApp();
    const res = await request(app).put("/internal/contact-gate/policy/self-serve")
      .set("authorization", "Bearer admin-token").send({ portalId: 7, policy: "never_create" });
    expect(res.status).toBe(200);
    expect(contactGateStore.setPolicy).toHaveBeenCalledWith(7, "never_create", true);
  });
});

describe("GET /internal/contact-gate/policy — session auth", () => {
  it("allows a matching session token to read policy", async () => {
    const { app } = buildApp();
    const token = signSessionToken(config, 42);
    const res = await request(app).get("/internal/contact-gate/policy?portalId=42").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("rejects a session token for a different portal", async () => {
    const { app } = buildApp();
    const token = signSessionToken(config, 999);
    const res = await request(app).get("/internal/contact-gate/policy?portalId=42").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
