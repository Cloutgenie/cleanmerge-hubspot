import request from "supertest";
import { describe, expect, it } from "vitest";
import { SOFTWARE_APPLICATION_JSON_LD, softwareApplicationJsonLdCspSource, softwareApplicationJsonLdScript } from "../src/agent-surface.js";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { MemoryTokenStore } from "../src/token-store.js";

const config: Config = {
  NODE_ENV: "test", PORT: 3000, PUBLIC_BASE_URL: "https://example.com",
  HUBSPOT_CLIENT_ID: "client", HUBSPOT_CLIENT_SECRET: "secret",
  HUBSPOT_REDIRECT_URI: "https://example.com/oauth/callback", HUBSPOT_SCOPES: "automation",
};

const app = createApp(config, new MemoryTokenStore());

const SITEMAP_LOCS = [
  "https://cleanmerge.jaduno.com/",
  "https://cleanmerge.jaduno.com/docs/pricing",
  "https://cleanmerge.jaduno.com/docs/setup",
  "https://cleanmerge.jaduno.com/docs/how-to-use",
  "https://cleanmerge.jaduno.com/docs/quote",
  "https://cleanmerge.jaduno.com/oauth/install",
];

describe("agent-readable surface", () => {
  it("serves /llms.txt as plain text with the CleanMerge-host copy", async () => {
    const res = await request(app).get("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toContain("# CleanMerge (Jaduno)");
    expect(res.text).toContain("Contact: jay@vain.agency");
    expect(res.text).toContain("Normalize CRM Data (free): $0 forever");
    expect(res.text).toContain("Warehouse Sync (paid): from about $299/month per connection");
    expect(res.text).toContain("https://cleanmerge.jaduno.com/docs/quote");
    expect(res.text).not.toContain("kinetify.com");
    expect(res.text).not.toContain("<html");
  });

  it("serves /robots.txt as plain text", async () => {
    const res = await request(app).get("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toBe("User-agent: *\nAllow: /\n\nSitemap: https://cleanmerge.jaduno.com/sitemap.xml\n");
  });

  it("serves /sitemap.xml as XML with the public URLs", async () => {
    const res = await request(app).get("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/xml/);
    for (const loc of SITEMAP_LOCS) expect(res.text).toContain(`<loc>${loc}</loc>`);
    expect(res.text).not.toContain("<html");
  });

  it("redirects /pricing to /docs/pricing", async () => {
    const res = await request(app).get("/pricing");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/docs/pricing");
  });

  it("injects SoftwareApplication JSON-LD into the homepage and pricing heads", async () => {
    const home = await request(app).get("/");
    const pricing = await request(app).get("/docs/pricing");
    for (const res of [home, pricing]) {
      expect(res.status).toBe(200);
      const head = res.text.slice(0, res.text.indexOf("</head>"));
      expect(head).toContain(softwareApplicationJsonLdScript);
      expect(head).not.toContain("<body");
      expect(res.headers["content-security-policy"]).toContain(softwareApplicationJsonLdCspSource);
      expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
      expect(res.text).toContain('href="mailto:jay@vain.agency"');
      expect(res.text).not.toContain("kinetify.com");
    }
    const parsed = JSON.parse(SOFTWARE_APPLICATION_JSON_LD) as { provider: { email: string }; offers: { price: string }[] };
    expect(parsed.provider.email).toBe("jay@vain.agency");
    expect(parsed.offers.map((offer) => offer.price)).toEqual(["0", "299"]);
  });
});
