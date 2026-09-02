import { afterEach, describe, expect, it, vi } from "vitest";
import { judgeCandidate } from "../src/dedup/ai-judgment.js";

describe("judgeCandidate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses the tool_use block into a judgment result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          { type: "text", text: "thinking..." },
          { type: "tool_use", name: "record_judgment", input: { sameEntity: true, confidence: 0.82, rationale: "Same phone, nickname variant of the same first name." } },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await judgeCandidate(
      "test-key",
      "CONTACT",
      { firstname: "Bob", lastname: "Smith" },
      { firstname: "Robert", lastname: "Smith" },
      { emailScore: 0, phoneScore: 1, nameScore: 0.79 },
    );

    expect(result).toEqual({ sameEntity: true, confidence: 0.82, rationale: "Same phone, nickname variant of the same first name." });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-api-key": "test-key" }) }),
    );
  });

  it("throws when the response has no tool_use block", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [{ type: "text", text: "no tool call" }] }) }));
    await expect(judgeCandidate("test-key", "COMPANY", {}, {}, {})).rejects.toThrow("did not include a tool_use judgment");
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "unauthorized" }));
    await expect(judgeCandidate("bad-key", "COMPANY", {}, {}, {})).rejects.toThrow("Anthropic judgment request failed (401)");
  });
});
