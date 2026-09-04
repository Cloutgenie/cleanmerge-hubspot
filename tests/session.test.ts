import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { signSessionToken, verifySessionToken } from "../src/session.js";

const config: Config = {
  NODE_ENV: "test", PORT: 3000, PUBLIC_BASE_URL: "https://example.com",
  HUBSPOT_CLIENT_ID: "client", HUBSPOT_CLIENT_SECRET: "secret",
  HUBSPOT_REDIRECT_URI: "https://example.com/oauth/callback", HUBSPOT_SCOPES: "automation",
};

describe("session tokens", () => {
  it("round-trips a valid token back to its portal id", () => {
    const token = signSessionToken(config, 42);
    expect(verifySessionToken(config, token)).toBe(42);
  });

  it("rejects a tampered payload", () => {
    const token = signSessionToken(config, 42);
    const [payload, signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ hubId: 99, exp: Date.now() + 100000 })).toString("base64url");
    expect(verifySessionToken(config, `${forgedPayload}.${signature}`)).toBeNull();
  });

  it("rejects a token signed with a different client secret", () => {
    const token = signSessionToken(config, 42);
    const otherConfig: Config = { ...config, HUBSPOT_CLIENT_SECRET: "different-secret" };
    expect(verifySessionToken(otherConfig, token)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifySessionToken(config, "not-a-real-token")).toBeNull();
    expect(verifySessionToken(config, "")).toBeNull();
  });

  it("rejects an expired token", () => {
    // Forge a payload with exp in the past, signed with the same key derivation session.ts uses internally.
    const key = crypto.createHmac("sha256", config.HUBSPOT_CLIENT_SECRET).update("cleanmerge-session-v1").digest();
    const payload = Buffer.from(JSON.stringify({ hubId: 42, exp: Date.now() - 1000 })).toString("base64url");
    const signature = crypto.createHmac("sha256", key).update(payload).digest("base64url");
    expect(verifySessionToken(config, `${payload}.${signature}`)).toBeNull();
  });
});
