import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/dedup/hubspot-client.js", async () => {
  const actual = await vi.importActual<typeof import("../src/dedup/hubspot-client.js")>("../src/dedup/hubspot-client.js");
  return { ...actual, getObject: vi.fn(), archiveObject: vi.fn() };
});

import { archiveObject, getObject } from "../src/dedup/hubspot-client.js";
import { evaluateContactCreation } from "../src/contact-gate/policy-engine.js";
import type { ContactGateStore, PolicyRow } from "../src/contact-gate/store.js";

function fakeStore(policy: PolicyRow, opts: { allowlisted?: boolean; suppressed?: boolean } = {}): ContactGateStore {
  return {
    getPolicy: vi.fn().mockResolvedValue(policy),
    isAllowlisted: vi.fn().mockResolvedValue(opts.allowlisted ?? false),
    isSuppressed: vi.fn().mockResolvedValue(opts.suppressed ?? false),
    recordQuarantine: vi.fn().mockResolvedValue(undefined),
  } as unknown as ContactGateStore;
}

beforeEach(() => {
  vi.mocked(getObject).mockReset();
  vi.mocked(archiveObject).mockReset();
});

describe("evaluateContactCreation", () => {
  it("ignores the event when the policy is 'create' (feature off), without even fetching the contact", async () => {
    const store = fakeStore({ portalId: 1, policy: "create", dryRun: true });
    const result = await evaluateContactCreation("token", store, { portalId: 1, objectId: "500", rawPayload: {} });
    expect(result).toEqual({ action: "ignored", reason: "policy_off" });
    expect(getObject).not.toHaveBeenCalled();
  });

  it("ignores a contact whose source isn't Conversations", async () => {
    vi.mocked(getObject).mockResolvedValue({ id: "500", properties: { email: "a@b.com", hs_object_source_label: "FORM" } });
    const store = fakeStore({ portalId: 1, policy: "quarantine", dryRun: true });
    const result = await evaluateContactCreation("token", store, { portalId: 1, objectId: "500", rawPayload: {} });
    expect(result).toEqual({ action: "ignored", reason: "not_conversations_source" });
    expect(archiveObject).not.toHaveBeenCalled();
  });

  it("matches the source label case-insensitively and regardless of exact casing/pluralization", async () => {
    vi.mocked(getObject).mockResolvedValue({ id: "500", properties: { email: "a@b.com", hs_object_source_label: "CONVERSATIONS" } });
    const store = fakeStore({ portalId: 1, policy: "quarantine", dryRun: true });
    const result = await evaluateContactCreation("token", store, { portalId: 1, objectId: "500", rawPayload: {} });
    expect(result.action).toBe("quarantined");
  });

  it("ignores an allowlisted contact even if it's Conversations-sourced", async () => {
    vi.mocked(getObject).mockResolvedValue({ id: "500", properties: { email: "a@trusted.com", hs_object_source_label: "Conversations" } });
    const store = fakeStore({ portalId: 1, policy: "quarantine", dryRun: true }, { allowlisted: true });
    const result = await evaluateContactCreation("token", store, { portalId: 1, objectId: "500", rawPayload: {} });
    expect(result).toEqual({ action: "ignored", reason: "allowlisted" });
    expect(archiveObject).not.toHaveBeenCalled();
  });

  it("logs only and does not call archiveObject when dryRun is true (the kill switch)", async () => {
    vi.mocked(getObject).mockResolvedValue({ id: "500", properties: { email: "a@unknown.com", hs_object_source_label: "Conversations" } });
    const store = fakeStore({ portalId: 1, policy: "quarantine", dryRun: true });
    const result = await evaluateContactCreation("token", store, { portalId: 1, objectId: "500", rawPayload: {} });
    expect(result).toEqual({ action: "quarantined", actionTaken: "logged_only" });
    expect(archiveObject).not.toHaveBeenCalled();
    expect(store.recordQuarantine).toHaveBeenCalledWith(expect.objectContaining({ actionTaken: "logged_only", contactId: "500" }));
  });

  it("calls archiveObject and records 'deleted' when dryRun is false", async () => {
    vi.mocked(getObject).mockResolvedValue({ id: "500", properties: { email: "a@unknown.com", hs_object_source_label: "Conversations" } });
    const store = fakeStore({ portalId: 1, policy: "quarantine", dryRun: false });
    const result = await evaluateContactCreation("token", store, { portalId: 1, objectId: "500", rawPayload: {} });
    expect(result).toEqual({ action: "quarantined", actionTaken: "deleted" });
    expect(archiveObject).toHaveBeenCalledWith("token", "contacts", "500");
    expect(store.recordQuarantine).toHaveBeenCalledWith(expect.objectContaining({ actionTaken: "deleted" }));
  });
});
