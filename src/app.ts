import crypto from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { z } from "zod";
import type { Config } from "./config.js";
import type { AiJudge } from "./dedup/engine.js";
import { runDedupScan } from "./dedup/engine.js";
import { executeMergeBatch } from "./dedup/merge-executor.js";
import { renderReviewPage, renderReviewScript } from "./dedup/review-ui.js";
import type { DedupStore, ReviewDecision } from "./dedup/store.js";
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

export function createApp(config: Config, tokenStore: TokenStore, dedup?: DedupDeps): Express {
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

        res.status(200).json({
          humanReviewed: approvedResult,
          highConfidence: includeHighConfidenceTier ? highConfidenceResult : undefined,
        });
      } catch (error) {
        console.error("Execute merges failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Execute merges failed" });
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
