import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { MemoryQuoteStore } from "../src/quote-store.js";
import { MemoryTokenStore } from "../src/token-store.js";

const config: Config = {
  NODE_ENV: "test", PORT: 3000, PUBLIC_BASE_URL: "https://example.com",
  HUBSPOT_CLIENT_ID: "client", HUBSPOT_CLIENT_SECRET: "secret",
  HUBSPOT_REDIRECT_URI: "https://example.com/oauth/callback", HUBSPOT_SCOPES: "automation",
  INTERNAL_ADMIN_TOKEN: "admin-token",
};

const valid = {
  name: "Ada Lovelace", email: "ada@acme.com", company: "Acme", hubspotPortalId: "12345",
  warehouse: "Databricks", objects: ["Contacts", "Companies"], rowVolume: "10,000 - 100,000 rows",
  frequency: "Daily", connections: "1", timeline: "Within a month", notes: "Lots of dupes",
};

function setup() {
  const store = new MemoryQuoteStore();
  return { store, app: createApp(config, new MemoryTokenStore(), undefined, undefined, undefined, undefined, undefined, store) };
}

describe("quote request form", () => {
  it("serves the form", async () => {
    const res = await request(setup().app).get("/docs/quote");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Request a Warehouse Sync quote");
  });

  it("saves a valid submission and redirects to the thank-you page", async () => {
    const { app, store } = setup();
    const res = await request(app).post("/docs/quote").type("form").send(valid);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe("/docs/quote/thanks");
    const saved = await store.list(10);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ email: "ada@acme.com", objects: ["Contacts", "Companies"], connections: 1 });
  });

  it("accepts a single checked object (urlencoded sends a string, not an array)", async () => {
    const { app, store } = setup();
    const res = await request(app).post("/docs/quote").type("form").send({ ...valid, objects: "Contacts" });
    expect(res.status).toBe(303);
    expect((await store.list(1))[0]!.objects).toEqual(["Contacts"]);
  });

  it("re-renders with errors and keeps what was typed when input is invalid", async () => {
    const { app, store } = setup();
    const res = await request(app).post("/docs/quote").type("form").send({ ...valid, email: "not-an-email", objects: [] });
    expect(res.status).toBe(400);
    expect(res.text).toContain("Enter a valid work email.");
    expect(res.text).toContain("Choose at least one HubSpot object");
    expect(res.text).toContain("Ada Lovelace");
    expect(await store.list(10)).toHaveLength(0);
  });

  it("escapes submitted values when re-rendering", async () => {
    const res = await request(setup().app).post("/docs/quote").type("form").send({ ...valid, name: `"><script>alert(1)</script>`, email: "bad" });
    expect(res.text).not.toContain("<script>alert(1)</script>");
  });

  it("silently drops honeypot submissions without saving", async () => {
    const { app, store } = setup();
    const res = await request(app).post("/docs/quote").type("form").send({ ...valid, website: "http://spam.example" });
    expect(res.status).toBe(303);
    expect(await store.list(10)).toHaveLength(0);
  });

  it("rate limits repeated submissions from one IP", async () => {
    const { app } = setup();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await request(app).post("/docs/quote").type("form").send(valid)).status);
    expect(statuses.slice(0, 5).every((s) => s === 303)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("lists requests only for the admin token", async () => {
    const { app } = setup();
    await request(app).post("/docs/quote").type("form").send(valid);
    expect((await request(app).get("/internal/admin/quote-requests")).status).toBe(401);
    const ok = await request(app).get("/internal/admin/quote-requests").set("Authorization", "Bearer admin-token");
    expect(ok.status).toBe(200);
    expect(ok.body.count).toBe(1);
  });
});

describe("quote notification email", () => {
  const build = (notify: (r: unknown) => Promise<void>) =>
    createApp(config, new MemoryTokenStore(), undefined, undefined, undefined, undefined, undefined, new MemoryQuoteStore(), notify as never);

  it("notifies once per saved request with the submitted details", async () => {
    const calls: unknown[] = [];
    const res = await request(build(async (r) => { calls.push(r); })).post("/docs/quote").type("form").send(valid);
    expect(res.status).toBe(303);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ email: "ada@acme.com", company: "Acme" });
  });

  it("still succeeds when the email send fails", async () => {
    const res = await request(build(async () => { throw new Error("resend down"); })).post("/docs/quote").type("form").send(valid);
    expect(res.status).toBe(303);
  });

  it("does not notify for invalid or honeypot submissions", async () => {
    let count = 0;
    const app = build(async () => { count++; });
    await request(app).post("/docs/quote").type("form").send({ ...valid, email: "bad" });
    await request(app).post("/docs/quote").type("form").send({ ...valid, website: "spam" });
    expect(count).toBe(0);
  });
});
