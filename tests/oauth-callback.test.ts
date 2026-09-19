import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { MemoryTokenStore } from "../src/token-store.js";

const config: Config = {
  NODE_ENV: "test", PORT: 3000, PUBLIC_BASE_URL: "https://example.com",
  HUBSPOT_CLIENT_ID: "client", HUBSPOT_CLIENT_SECRET: "secret",
  HUBSPOT_REDIRECT_URI: "https://example.com/oauth/callback", HUBSPOT_SCOPES: "automation",
};

afterEach(() => vi.unstubAllGlobals());

describe("GET /oauth/callback", () => {
  it("deep-links straight into the installer's own Workflows page and shows the required setup steps", async () => {
    const app = createApp(config, new MemoryTokenStore());

    // Real state signing lives in oauth.ts and isn't exported, so mint a valid one the same way
    // a real installer would: by actually hitting /oauth/install and reading it off the redirect.
    const install = await request(app).get("/oauth/install");
    const location = install.headers.location as string;
    const state = new URL(location).searchParams.get("state")!;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "a", refresh_token: "r", expires_in: 1000, hub_id: 999, scopes: [] }),
    }));

    const response = await request(app).get("/oauth/callback").query({ code: "fake-code", state });

    expect(response.status).toBe(200);
    expect(response.text).toContain("https://app.hubspot.com/workflows/999");
    expect(response.text).toContain("Set property value");
    expect(response.text).toContain("CleanMerge is connected");
  });
});
