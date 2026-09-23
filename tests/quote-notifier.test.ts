import { afterEach, describe, expect, it, vi } from "vitest";
import { createResendNotifier, formatQuoteEmail } from "../src/quote-notifier.js";
import type { QuoteRequest } from "../src/quote-store.js";

const sample: QuoteRequest = {
  id: "abc", createdAt: "2026-09-23T00:00:00.000Z", name: "Ada", email: "ada@acme.com", company: "Acme\nBcc: evil@x.com",
  warehouse: "Databricks", objects: ["Contacts"], rowVolume: "Not sure", frequency: "Daily", connections: 2, timeline: "Just exploring",
};

afterEach(() => vi.unstubAllGlobals());

describe("quote notifier", () => {
  it("keeps the subject on one line", () => {
    expect(formatQuoteEmail(sample).subject).not.toMatch(/[\r\n]/);
  });

  it("posts to Resend with reply-to set to the requester", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await createResendNotifier({ apiKey: "k", to: "jay@kinetify.com", from: "CleanMerge <quotes@kinetify.com>" })(sample);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ to: ["jay@kinetify.com"], reply_to: "ada@acme.com" });
    expect(init.headers.Authorization).toBe("Bearer k");
  });

  it("throws when Resend rejects the request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(createResendNotifier({ apiKey: "k", to: "a@b.co", from: "x" })(sample)).rejects.toThrow("403");
  });
});
