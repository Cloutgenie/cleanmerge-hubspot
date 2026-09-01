import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const MAX_AGE_MS = 5 * 60 * 1000;
const DECODABLE = /%3A|%2F|%3F|%40|%21|%24|%27|%28|%29|%2A|%2C|%3B/gi;
const decodeMap: Record<string, string> = {
  "%3A": ":", "%2F": "/", "%3F": "?", "%40": "@", "%21": "!", "%24": "$",
  "%27": "'", "%28": "(", "%29": ")", "%2A": "*", "%2C": ",", "%3B": ";",
};

export interface RawBodyRequest extends Request { rawBody?: Buffer }

function signatureUri(req: Request): string {
  const protocol = (req.get("x-forwarded-proto")?.split(",")[0] ?? req.protocol).trim();
  const host = (req.get("x-forwarded-host")?.split(",")[0] ?? req.get("host") ?? "").trim();
  const original = req.originalUrl.split("#", 1)[0];
  const queryAt = original.indexOf("?");
  if (queryAt < 0) return `${protocol}://${host}${original}`;
  const path = original.slice(0, queryAt + 1);
  const query = original.slice(queryAt + 1).replace(DECODABLE, (match) => decodeMap[match.toUpperCase()]);
  return `${protocol}://${host}${path}${query}`;
}

export function verifyHubSpotSignature(clientSecret: string) {
  return (req: RawBodyRequest, res: Response, next: NextFunction): void => {
    const received = req.get("x-hubspot-signature-v3");
    const timestamp = req.get("x-hubspot-request-timestamp");
    const timestampMs = Number(timestamp);
    if (!received || !timestamp || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_AGE_MS) {
      res.status(401).json({ error: "Invalid or expired HubSpot signature" });
      return;
    }
    const source = `${req.method.toUpperCase()}${signatureUri(req)}${req.rawBody?.toString("utf8") ?? ""}${timestamp}`;
    const expected = crypto.createHmac("sha256", clientSecret).update(source, "utf8").digest("base64");
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);
    if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
      res.status(401).json({ error: "Invalid HubSpot signature" });
      return;
    }
    next();
  };
}
