import crypto from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { z } from "zod";
import type { Config } from "./config.js";
import type { AiJudge } from "./dedup/engine.js";
import { runDedupScan } from "./dedup/engine.js";
import { archiveObject, createObject, listAllObjects, listOwners } from "./dedup/hubspot-client.js";
import { executeIngestBatch, executeMergeBatch } from "./dedup/merge-executor.js";
import { renderReviewPage, renderReviewScript } from "./dedup/review-ui.js";
import type { DedupStore, ReviewDecision } from "./dedup/store.js";
import { evaluateContactCreation } from "./contact-gate/policy-engine.js";
import type { AllowlistMatchType, ContactGatePolicy, ContactGateStore } from "./contact-gate/store.js";
import { runIngest } from "./ingest/engine.js";
import { DatabricksConnector } from "./ingest/connectors/databricks.js";
import { PostgresConnector } from "./ingest/connectors/postgres.js";
import type { WarehouseConnector } from "./ingest/connector.js";
import type { FieldMappingEntry, IngestStore, ObjectType, WarehouseConnectionRow } from "./ingest/store.js";
import { oauthHandlers } from "./oauth.js";
import { verifyHubSpotSignature, type RawBodyRequest } from "./signature.js";
import { renderPricing } from "./pricing.js";
import { renderPrivacyPolicy } from "./privacy-policy.js";
import { renderSetupGuide } from "./setup-guide.js";
import { renderSharedDataGuide } from "./shared-data-guide.js";
import { renderTermsOfService } from "./terms-of-service.js";
import type { OAuthTokenManager } from "./token-manager.js";
import type { TokenStore } from "./token-store.js";
import { transform } from "./transformations.js";
import { transformationTypes } from "./types.js";

export interface DedupDeps {
  tokenManager: OAuthTokenManager;
  dedupStore: DedupStore;
  judge?: AiJudge;
}

export interface IngestDeps {
  tokenManager: OAuthTokenManager;
  ingestStore: IngestStore;
  dedupStore: DedupStore;
}

export interface ContactGateDeps {
  tokenManager: OAuthTokenManager;
  contactGateStore: ContactGateStore;
}

function connectorFactory(connection: WarehouseConnectionRow): WarehouseConnector {
  if (connection.connectorType === "postgres") return new PostgresConnector(connection.credentials);
  return new DatabricksConnector(connection.config as { serverHostname: string; httpPath: string; catalog?: string; schema?: string }, connection.credentials);
}

function isAuthorizedAdmin(req: Request, adminToken: string | undefined): boolean {
  if (!adminToken) return false;
  const provided = req.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = Buffer.from(adminToken);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const executionSchema = z.object({
  callbackId: z.string().min(1),
  inputFields: z.object({
    inputText: z.string(),
    transformationType: z.enum(transformationTypes),
  }),
}).passthrough();

export function createApp(config: Config, tokenStore: TokenStore, dedup?: DedupDeps, ingest?: IngestDeps, contactGate?: ContactGateDeps): Express {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "256kb", verify: (req, _res, buffer) => { (req as RawBodyRequest).rawBody = Buffer.from(buffer); } }));

  const oauth = oauthHandlers(config, tokenStore);
  app.get("/oauth/install", oauth.install);
  app.get("/oauth/callback", oauth.callback);
  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

  app.get("/docs/setup", (_req, res) => {
    res.status(200).type("html").send(renderSetupGuide(`${config.PUBLIC_BASE_URL.replace(/\/$/, "")}/oauth/install`));
  });

  app.get("/docs/shared-data", (_req, res) => {
    res.status(200).type("html").send(renderSharedDataGuide());
  });

  app.get("/docs/pricing", (_req, res) => {
    res.status(200).type("html").send(renderPricing(`${config.PUBLIC_BASE_URL.replace(/\/$/, "")}/oauth/install`));
  });

  app.get("/docs/privacy", (_req, res) => {
    res.status(200).type("html").send(renderPrivacyPolicy());
  });

  app.get("/docs/terms", (_req, res) => {
    res.status(200).type("html").send(renderTermsOfService());
  });

  app.post("/api/hubspot/action", verifyHubSpotSignature(config.HUBSPOT_CLIENT_SECRET), (req, res) => {
    const parsed = executionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(200).json({ outputFields: { outputText: "", status: "ERROR: Invalid workflow action payload" } });
      return;
    }
    const { inputText, transformationType } = parsed.data.inputFields;
    try {
      const outputText = transform(inputText, transformationType);
      res.status(200).json({ outputFields: { outputText, status: "SUCCESS" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transformation failed";
      res.status(200).json({ outputFields: { outputText: inputText, status: `ERROR: ${message}` } });
    }
  });

  if (contactGate) {
    // HubSpot's webhooks component delivers every subscribed event type to this one URL
    // (see cleanmerge-hubspot-app's webhooks-hsmeta.json — one webhooks component per project),
    // as a batch array; each event carries its own subscriptionType/portalId/objectId. The exact
    // delivered field shape hasn't been confirmed against a live payload yet (see plan Phase 0
    // step 3), so subscriptionType is matched loosely (contains "contact" and "creat") rather than
    // an exact string, and any event that doesn't parse is skipped (logged) rather than crashing
    // the batch — HubSpot expects a fast 200 regardless.
    app.post("/webhooks/hubspot", verifyHubSpotSignature(config.HUBSPOT_CLIENT_SECRET), async (req, res) => {
      res.status(200).json({ received: true }); // ack immediately; HubSpot retries on non-2xx
      const events = Array.isArray(req.body) ? req.body : [req.body];
      for (const event of events) {
        try {
          const subscriptionType = String(event?.subscriptionType ?? "").toLocaleLowerCase("en-US");
          const objectType = String(event?.objectType ?? "").toLocaleLowerCase("en-US");
          // Two possible delivered shapes (see plan's Phase 0 note): legacy dotted strings like
          // "contact.creation" carry the object type IN subscriptionType; the modern declarative
          // format (what this project's webhooks-hsmeta.json actually uses) sends a generic
          // "object.creation" with the object type in a separate `objectType` field.
          const isLegacyContactCreation = subscriptionType.includes("contact") && subscriptionType.includes("creat");
          const isModernContactCreation = subscriptionType === "object.creation" && objectType === "contact";
          const isContactCreation = isLegacyContactCreation || isModernContactCreation;
          const portalId = Number(event?.portalId);
          const objectId = event?.objectId != null ? String(event.objectId) : undefined;
          console.log("Contact Gate webhook event received", { subscriptionType, objectType, portalId, objectId, isContactCreation, raw: event });
          if (!isContactCreation || !Number.isInteger(portalId) || portalId <= 0 || !objectId) continue;

          const accessToken = await contactGate.tokenManager.getAccessToken(portalId);
          const decision = await evaluateContactCreation(accessToken, contactGate.contactGateStore, { portalId, objectId, rawPayload: event });
          console.log("Contact Gate decision", { portalId, objectId, decision });
        } catch (error) {
          console.error("Contact Gate webhook event failed", error instanceof Error ? error.message : error);
        }
      }
    });

    app.put("/internal/contact-gate/policy", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const portalId = Number(req.body?.portalId);
      const policy: ContactGatePolicy = req.body?.policy;
      const dryRun = req.body?.dryRun;
      if (
        !Number.isInteger(portalId) || portalId <= 0 ||
        !["never_create", "allowlist_only", "quarantine", "create"].includes(policy) ||
        typeof dryRun !== "boolean"
      ) {
        res.status(400).json({ error: "portalId, policy ('never_create'|'allowlist_only'|'quarantine'|'create'), and dryRun (boolean) are required" });
        return;
      }
      try {
        await contactGate.contactGateStore.setPolicy(portalId, policy, dryRun);
        await contactGate.contactGateStore.recordAudit({ portalId, actor: "admin", action: "policy_change", target: { policy, dryRun } });
        res.status(200).json({ saved: true });
      } catch (error) {
        console.error("Set Contact Gate policy failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Set Contact Gate policy failed" });
      }
    });

    app.get("/internal/contact-gate/policy", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const portalId = Number(req.query.portalId);
      if (!Number.isInteger(portalId) || portalId <= 0) { res.status(400).json({ error: "portalId must be a positive integer" }); return; }
      try {
        res.status(200).json(await contactGate.contactGateStore.getPolicy(portalId));
      } catch (error) {
        console.error("Get Contact Gate policy failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Get Contact Gate policy failed" });
      }
    });

    app.get("/internal/contact-gate/quarantine", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const portalId = Number(req.query.portalId);
      if (!Number.isInteger(portalId) || portalId <= 0) { res.status(400).json({ error: "portalId must be a positive integer" }); return; }
      try {
        res.status(200).json({ candidates: await contactGate.contactGateStore.listPending(portalId) });
      } catch (error) {
        console.error("List Contact Gate quarantine failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "List Contact Gate quarantine failed" });
      }
    });

    app.post("/internal/contact-gate/quarantine/:id/promote", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid quarantine id" }); return; }
      try {
        const row = await contactGate.contactGateStore.getQuarantineById(id);
        if (!row) { res.status(404).json({ error: "No quarantine entry with that id" }); return; }
        let recreatedId: string | undefined;
        if (row.actionTaken === "deleted") {
          const accessToken = await contactGate.tokenManager.getAccessToken(row.portalId);
          const created = await createObject(accessToken, "contacts", { email: row.email });
          recreatedId = created.id;
        }
        if (req.body?.addToAllowlist === true) {
          const domain = row.email.split("@")[1];
          if (domain) await contactGate.contactGateStore.addToAllowlist(row.portalId, "domain", domain);
        }
        await contactGate.contactGateStore.markQuarantineStatus(id, "promoted");
        await contactGate.contactGateStore.recordAudit({ portalId: row.portalId, actor: "admin", action: "promote", target: { quarantineId: id, recreatedId } });
        res.status(200).json({ promoted: true, recreatedId });
      } catch (error) {
        console.error("Promote Contact Gate entry failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Promote Contact Gate entry failed" });
      }
    });

    app.post("/internal/contact-gate/quarantine/:id/discard", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const id = Number(req.params.id);
      const suppressDays = Number(req.body?.suppressDays ?? 30);
      if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid quarantine id" }); return; }
      try {
        const row = await contactGate.contactGateStore.getQuarantineById(id);
        if (!row) { res.status(404).json({ error: "No quarantine entry with that id" }); return; }
        await contactGate.contactGateStore.suppress(row.portalId, row.email, suppressDays);
        await contactGate.contactGateStore.markQuarantineStatus(id, "discarded");
        await contactGate.contactGateStore.recordAudit({ portalId: row.portalId, actor: "admin", action: "discard", target: { quarantineId: id, suppressDays } });
        res.status(200).json({ discarded: true });
      } catch (error) {
        console.error("Discard Contact Gate entry failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Discard Contact Gate entry failed" });
      }
    });

    app.post("/internal/contact-gate/allowlist", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const portalId = Number(req.body?.portalId);
      const matchType: AllowlistMatchType = req.body?.matchType;
      const matchValue = req.body?.matchValue;
      if (!Number.isInteger(portalId) || portalId <= 0 || !["domain", "email"].includes(matchType) || typeof matchValue !== "string" || !matchValue) {
        res.status(400).json({ error: "portalId, matchType ('domain'|'email'), and matchValue are required" });
        return;
      }
      try {
        await contactGate.contactGateStore.addToAllowlist(portalId, matchType, matchValue);
        await contactGate.contactGateStore.recordAudit({ portalId, actor: "admin", action: "allowlist_add", target: { matchType, matchValue } });
        res.status(200).json({ added: true });
      } catch (error) {
        console.error("Add to Contact Gate allowlist failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Add to Contact Gate allowlist failed" });
      }
    });

    app.post("/internal/contact-gate/seed-allowlist", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const portalId = Number(req.body?.portalId);
      if (!Number.isInteger(portalId) || portalId <= 0) { res.status(400).json({ error: "portalId must be a positive integer" }); return; }
      try {
        const accessToken = await contactGate.tokenManager.getAccessToken(portalId);
        const [companies, owners] = await Promise.all([
          listAllObjects(accessToken, "companies", ["domain"]),
          listOwners(accessToken),
        ]);
        const domains = companies.map((c) => c.properties.domain).filter((d): d is string => !!d);
        const emails = owners.map((o) => o.email);
        await Promise.all([
          ...domains.map((d) => contactGate.contactGateStore.addToAllowlist(portalId, "domain", d)),
          ...emails.map((e) => contactGate.contactGateStore.addToAllowlist(portalId, "email", e)),
        ]);
        await contactGate.contactGateStore.recordAudit({ portalId, actor: "admin", action: "seed_allowlist", target: { domainCount: domains.length, emailCount: emails.length } });
        res.status(200).json({ domainsAdded: domains.length, emailsAdded: emails.length });
      } catch (error) {
        console.error("Seed Contact Gate allowlist failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Seed Contact Gate allowlist failed" });
      }
    });

    app.get("/internal/contact-gate/allowlist", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const portalId = Number(req.query.portalId);
      if (!Number.isInteger(portalId) || portalId <= 0) { res.status(400).json({ error: "portalId must be a positive integer" }); return; }
      try {
        res.status(200).json({ allowlist: await contactGate.contactGateStore.listAllowlist(portalId) });
      } catch (error) {
        console.error("List Contact Gate allowlist failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "List Contact Gate allowlist failed" });
      }
    });

    app.get("/internal/contact-gate/audit", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const portalId = Number(req.query.portalId);
      if (!Number.isInteger(portalId) || portalId <= 0) { res.status(400).json({ error: "portalId must be a positive integer" }); return; }
      try {
        res.status(200).json({ entries: await contactGate.contactGateStore.listAudit(portalId) });
      } catch (error) {
        console.error("List Contact Gate audit log failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "List Contact Gate audit log failed" });
      }
    });
  }

  if (dedup) {
    app.post("/internal/dedup/scan", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const portalId = Number(req.body?.portalId);
      if (!Number.isInteger(portalId) || portalId <= 0) {
        res.status(400).json({ error: "portalId must be a positive integer" });
        return;
      }
      try {
        const summaries = await runDedupScan(portalId, dedup.tokenManager, dedup.dedupStore, dedup.judge);
        res.status(200).json({ summaries });
      } catch (error) {
        console.error("Dedup scan failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Dedup scan failed" });
      }
    });

    app.get("/internal/dedup/review-ui", (_req, res) => {
      res.status(200).type("html").send(renderReviewPage());
    });

    app.get("/internal/dedup/review-ui.js", (_req, res) => {
      res.status(200).type("application/javascript").send(renderReviewScript());
    });

    app.get("/internal/dedup/review-candidates", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const portalId = Number(req.query.portalId);
      if (!Number.isInteger(portalId) || portalId <= 0) {
        res.status(400).json({ error: "portalId must be a positive integer" });
        return;
      }
      try {
        const candidates = await dedup.dedupStore.listPendingReview(portalId);
        res.status(200).json({ candidates });
      } catch (error) {
        console.error("List review candidates failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "List review candidates failed" });
      }
    });

    app.post("/internal/dedup/review-decide", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const portalId = Number(req.body?.portalId);
      const objectType = req.body?.objectType;
      const recordAId = req.body?.recordAId;
      const recordBId = req.body?.recordBId;
      const decision: ReviewDecision = req.body?.decision;
      if (
        !Number.isInteger(portalId) || portalId <= 0 ||
        (objectType !== "COMPANY" && objectType !== "CONTACT") ||
        typeof recordAId !== "string" || !recordAId ||
        typeof recordBId !== "string" || !recordBId ||
        (decision !== "approved" && decision !== "rejected")
      ) {
        res.status(400).json({ error: "portalId, objectType ('COMPANY' | 'CONTACT'), recordAId, recordBId, and decision ('approved' | 'rejected') are required" });
        return;
      }
      try {
        await dedup.dedupStore.recordDecision(portalId, objectType, recordAId, recordBId, decision);
        res.status(200).json({ recorded: decision });
      } catch (error) {
        console.error("Record review decision failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Record review decision failed" });
      }
    });

    app.post("/internal/dedup/clear-candidates", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const portalId = Number(req.body?.portalId);
      if (!Number.isInteger(portalId) || portalId <= 0) {
        res.status(400).json({ error: "portalId must be a positive integer" });
        return;
      }
      try {
        const cleared = await dedup.dedupStore.clearCandidates(portalId);
        res.status(200).json({ cleared });
      } catch (error) {
        console.error("Clear candidates failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Clear candidates failed" });
      }
    });

    app.post("/internal/dedup/execute-merges", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const portalId = Number(req.body?.portalId);
      const includeHighConfidenceTier = req.body?.includeHighConfidenceTier === true;
      if (!Number.isInteger(portalId) || portalId <= 0) {
        res.status(400).json({ error: "portalId must be a positive integer" });
        return;
      }
      try {
        const accessToken = await dedup.tokenManager.getAccessToken(portalId);
        const approved = await dedup.dedupStore.listApprovedForMerge(portalId);
        const approvedResult = await executeMergeBatch(accessToken, portalId, approved, dedup.dedupStore, "human_review");

        let highConfidenceResult: Awaited<ReturnType<typeof executeMergeBatch>> = { succeeded: [], failed: [] };
        if (includeHighConfidenceTier) {
          const highConfidence = await dedup.dedupStore.listHighConfidencePending(portalId);
          highConfidenceResult = await executeMergeBatch(accessToken, portalId, highConfidence, dedup.dedupStore, "auto_high_confidence");
        }

        // Ingest-sourced review decisions (approve = update, reject = create) execute the same way,
        // via the same accessToken, in the same call — they're both "apply pending human decisions."
        const ingestResolutions = await executeIngestBatch(accessToken, portalId, dedup.dedupStore);

        res.status(200).json({
          humanReviewed: approvedResult,
          highConfidence: includeHighConfidenceTier ? highConfidenceResult : undefined,
          ingestResolutions,
        });
      } catch (error) {
        console.error("Execute merges failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Execute merges failed" });
      }
    });

    // General-purpose admin correction tool — e.g. archiving a record a bad ingest mapping created.
    app.delete("/internal/dedup/objects/:objectType/:id", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const objectType = req.params.objectType;
      const id = req.params.id;
      const portalId = Number(req.body?.portalId);
      if ((objectType !== "companies" && objectType !== "contacts") || !id || !Number.isInteger(portalId) || portalId <= 0) {
        res.status(400).json({ error: "objectType ('companies' | 'contacts'), id (in the path), and portalId (in the body) are required" });
        return;
      }
      try {
        const accessToken = await dedup.tokenManager.getAccessToken(portalId);
        await archiveObject(accessToken, objectType, id);
        res.status(200).json({ archived: true });
      } catch (error) {
        console.error("Archive object failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Archive object failed" });
      }
    });
  }

  if (ingest) {
    app.post("/internal/ingest/connections", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const portalId = Number(req.body?.portalId);
      const name = req.body?.name;
      const connectorType = req.body?.connectorType;
      const connConfig = req.body?.config;
      const credentials = req.body?.credentials;
      if (
        !Number.isInteger(portalId) || portalId <= 0 ||
        typeof name !== "string" || !name ||
        typeof connectorType !== "string" || !connectorType ||
        typeof connConfig !== "object" || connConfig === null ||
        typeof credentials !== "string" || !credentials
      ) {
        res.status(400).json({ error: "portalId, name, connectorType, config, and credentials are required" });
        return;
      }
      try {
        const id = await ingest.ingestStore.createConnection(portalId, name, connectorType, connConfig, credentials);
        res.status(200).json({ id });
      } catch (error) {
        console.error("Create warehouse connection failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Create warehouse connection failed" });
      }
    });

    app.put("/internal/ingest/connections/:id", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid connection id" }); return; }
      try {
        await ingest.ingestStore.updateConnection(id, req.body?.config, req.body?.credentials);
        res.status(200).json({ updated: true });
      } catch (error) {
        console.error("Update warehouse connection failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Update warehouse connection failed" });
      }
    });

    app.delete("/internal/ingest/connections/:id", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const id = Number(req.params.id);
      const portalId = Number(req.body?.portalId);
      if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(portalId) || portalId <= 0) {
        res.status(400).json({ error: "A valid connection id and portalId (in the request body) are required" });
        return;
      }
      try {
        const deleted = await ingest.ingestStore.deleteConnection(id, portalId);
        if (!deleted) { res.status(404).json({ error: "No connection with that id found for this portal" }); return; }
        res.status(200).json({ deleted: true });
      } catch (error) {
        console.error("Delete warehouse connection failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Delete warehouse connection failed" });
      }
    });

    app.get("/internal/ingest/connections", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const portalId = Number(req.query.portalId);
      if (!Number.isInteger(portalId) || portalId <= 0) { res.status(400).json({ error: "portalId must be a positive integer" }); return; }
      try {
        const connections = await ingest.ingestStore.listConnections(portalId);
        res.status(200).json({ connections });
      } catch (error) {
        console.error("List warehouse connections failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "List warehouse connections failed" });
      }
    });

    app.post("/internal/ingest/mappings", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const connectionId = Number(req.body?.connectionId);
      const objectType: ObjectType = req.body?.objectType;
      const sourceQuery = req.body?.sourceQuery;
      const mappings: FieldMappingEntry[] = req.body?.mappings;
      const matchKeyColumns: string[] = req.body?.matchKeyColumns;
      if (
        !Number.isInteger(connectionId) || connectionId <= 0 ||
        (objectType !== "COMPANY" && objectType !== "CONTACT") ||
        typeof sourceQuery !== "string" || !sourceQuery ||
        !Array.isArray(mappings) || mappings.length === 0 ||
        !Array.isArray(matchKeyColumns) || matchKeyColumns.length === 0
      ) {
        res.status(400).json({ error: "connectionId, objectType, sourceQuery, mappings, and matchKeyColumns are required" });
        return;
      }
      try {
        await ingest.ingestStore.upsertMapping({
          connectionId, objectType, sourceQuery, mappings, matchKeyColumns,
          cronSchedule: typeof req.body?.cronSchedule === "string" ? req.body.cronSchedule : null,
          enabled: req.body?.enabled !== false,
        });
        res.status(200).json({ saved: true });
      } catch (error) {
        console.error("Save field mapping failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Save field mapping failed" });
      }
    });

    app.get("/internal/ingest/mappings", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const connectionId = Number(req.query.connectionId);
      if (!Number.isInteger(connectionId) || connectionId <= 0) { res.status(400).json({ error: "connectionId must be a positive integer" }); return; }
      try {
        const mappings = await ingest.ingestStore.listMappings(connectionId);
        res.status(200).json({ mappings });
      } catch (error) {
        console.error("List field mappings failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "List field mappings failed" });
      }
    });

    app.post("/internal/ingest/run", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const portalId = Number(req.body?.portalId);
      const connectionId = Number(req.body?.connectionId);
      if (!Number.isInteger(portalId) || portalId <= 0 || !Number.isInteger(connectionId) || connectionId <= 0) {
        res.status(400).json({ error: "portalId and connectionId must be positive integers" });
        return;
      }
      try {
        const summaries = await runIngest(portalId, connectionId, ingest.tokenManager, ingest.ingestStore, ingest.dedupStore, connectorFactory, "manual");
        res.status(200).json({ summaries });
      } catch (error) {
        console.error("Ingest run failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Ingest run failed" });
      }
    });

    app.get("/internal/ingest/runs", async (req, res) => {
      if (!isAuthorizedAdmin(req, config.INTERNAL_ADMIN_TOKEN)) { res.status(401).json({ error: "Unauthorized" }); return; }
      const portalId = Number(req.query.portalId);
      if (!Number.isInteger(portalId) || portalId <= 0) { res.status(400).json({ error: "portalId must be a positive integer" }); return; }
      const connectionId = req.query.connectionId ? Number(req.query.connectionId) : undefined;
      try {
        const runs = await ingest.ingestStore.listRuns(portalId, connectionId);
        res.status(200).json({ runs });
      } catch (error) {
        console.error("List ingest runs failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "List ingest runs failed" });
      }
    });
  }

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled request error", error);
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}
