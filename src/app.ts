import crypto from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { z } from "zod";
import type { Config } from "./config.js";
import { runDedupScan } from "./dedup/engine.js";
import { seedDedupTestData } from "./dedup/seed.js";
import type { DedupStore } from "./dedup/store.js";
import { oauthHandlers } from "./oauth.js";
import { verifyHubSpotSignature, type RawBodyRequest } from "./signature.js";
import type { OAuthTokenManager } from "./token-manager.js";
import type { TokenStore } from "./token-store.js";
import { transform } from "./transformations.js";
import { transformationTypes } from "./types.js";

export interface DedupDeps {
  tokenManager: OAuthTokenManager;
  dedupStore: DedupStore;
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
    app.get("/internal/dedup/portal-info", async (req, res) => {
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
        const accessToken = await dedup.tokenManager.getAccessToken(portalId);
        const response = await fetch("https://api.hubapi.com/account-info/v3/details", { headers: { authorization: `Bearer ${accessToken}` } });
        if (!response.ok) throw new Error(`HubSpot account-info failed (${response.status})`);
        const details = (await response.json()) as { portalId: number; accountType?: string; timeZone?: string; companyName?: string; uiDomain?: string };
        res.status(200).json({ portalId: details.portalId, companyName: details.companyName, uiDomain: details.uiDomain, accountType: details.accountType });
      } catch (error) {
        console.error("Portal info lookup failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Portal info lookup failed" });
      }
    });

    app.post("/internal/dedup/seed-test-data", async (req, res) => {
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
        const accessToken = await dedup.tokenManager.getAccessToken(portalId);
        const result = await seedDedupTestData(accessToken);
        res.status(200).json(result);
      } catch (error) {
        console.error("Dedup test-data seed failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Dedup test-data seed failed" });
      }
    });

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
        const summaries = await runDedupScan(portalId, dedup.tokenManager, dedup.dedupStore);
        res.status(200).json({ summaries });
      } catch (error) {
        console.error("Dedup scan failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Dedup scan failed" });
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
