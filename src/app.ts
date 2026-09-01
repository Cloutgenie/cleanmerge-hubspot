import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { z } from "zod";
import type { Config } from "./config.js";
import { oauthHandlers } from "./oauth.js";
import { verifyHubSpotSignature, type RawBodyRequest } from "./signature.js";
import type { TokenStore } from "./token-store.js";
import { transform } from "./transformations.js";
import { transformationTypes } from "./types.js";

const executionSchema = z.object({
  callbackId: z.string().min(1),
  inputFields: z.object({
    inputText: z.string(),
    transformationType: z.enum(transformationTypes),
  }),
}).passthrough();

export function createApp(config: Config, tokenStore: TokenStore): Express {
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

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled request error", error);
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}
