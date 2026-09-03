import { archiveObject, getObject } from "../dedup/hubspot-client.js";
import type { ContactGateStore } from "./store.js";

/**
 * Matched case-insensitively against hs_object_source_label. The exact literal HubSpot emits for
 * a Conversations-created contact is NOT yet confirmed from a live payload (see the plan's Phase 0
 * step 3) — a substring match on "conversation" is deliberately used instead of an exact-equality
 * check so this doesn't silently stop working over an exact-casing/pluralization guess. Tighten
 * this once a real value has been observed.
 */
function isConversationsSource(sourceLabel: string | null): boolean {
  return sourceLabel !== null && sourceLabel.toLocaleLowerCase("en-US").includes("conversation");
}

export interface ContactCreationEvent {
  portalId: number;
  objectId: string; // the contact id
  rawPayload: unknown;
}

export type GateDecision =
  | { action: "ignored"; reason: "policy_off" | "not_conversations_source" | "allowlisted" }
  | { action: "quarantined"; actionTaken: "logged_only" | "deleted" };

/**
 * Runs once per contact.creation webhook event. Never throws on a HubSpot API error for the
 * lookup/archive calls without the caller knowing — errors propagate so the webhook handler can
 * log per-event failures without losing the rest of a batch.
 */
export async function evaluateContactCreation(
  accessToken: string,
  store: ContactGateStore,
  event: ContactCreationEvent,
): Promise<GateDecision> {
  const policyRow = await store.getPolicy(event.portalId);
  if (policyRow.policy === "create") {
    return { action: "ignored", reason: "policy_off" };
  }

  const contact = await getObject(accessToken, "contacts", event.objectId, ["email", "hs_object_source_label"]);
  const email = contact.properties.email;
  const sourceLabel = contact.properties.hs_object_source_label ?? null;

  if (!isConversationsSource(sourceLabel)) {
    return { action: "ignored", reason: "not_conversations_source" };
  }

  if (email) {
    const [allowlisted, suppressed] = await Promise.all([
      store.isAllowlisted(event.portalId, email),
      store.isSuppressed(event.portalId, email),
    ]);
    if (allowlisted && policyRow.policy !== "never_create") {
      return { action: "ignored", reason: "allowlisted" };
    }
    // A suppressed email that keeps getting recreated is treated exactly like a fresh quarantine
    // hit below (spec item 6) — no special branch needed, since recordQuarantine/archive is the
    // same action either way; suppression only matters for whether a human already said "discard."
    void suppressed;
  }

  const actionTaken = policyRow.dryRun ? "logged_only" : "deleted";
  if (!policyRow.dryRun) {
    await archiveObject(accessToken, "contacts", event.objectId);
  }
  await store.recordQuarantine({
    portalId: event.portalId,
    contactId: event.objectId,
    email: email ?? "",
    sourceLabel,
    actionTaken,
    rawPayload: event.rawPayload,
  });

  return { action: "quarantined", actionTaken };
}
