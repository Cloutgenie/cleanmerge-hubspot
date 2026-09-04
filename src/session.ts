import crypto from "node:crypto";
import type { Config } from "./config.js";

interface SessionPayload { hubId: number; exp: number }

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function sessionKey(config: Config): Buffer {
  return crypto.createHmac("sha256", config.HUBSPOT_CLIENT_SECRET).update("cleanmerge-session-v1").digest();
}

/**
 * Self-contained bearer credential for the settings-page extension: {hubId, exp} HMAC-signed with
 * a key derived from HUBSPOT_CLIENT_SECRET (same secret-reuse pattern as oauth.ts's signState/
 * verifyState, so no new Railway env var is required). Portal id is embedded, never client-supplied.
 */
export function signSessionToken(config: Config, hubId: number): string {
  const payload = Buffer.from(JSON.stringify({ hubId, exp: Date.now() + SESSION_TTL_MS } satisfies SessionPayload)).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionKey(config)).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/** Returns the verified portal id, or null if the token is missing, tampered, malformed, or expired. */
export function verifySessionToken(config: Config, token: string): number | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", sessionKey(config)).update(payload).digest("base64url");
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (!Number.isInteger(data.hubId) || data.hubId <= 0 || data.exp <= Date.now()) return null;
    return data.hubId;
  } catch {
    return null;
  }
}

const PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids transcription errors
const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;

export function generatePairingCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += PAIRING_CODE_ALPHABET[crypto.randomInt(PAIRING_CODE_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function pairingCodeExpiry(): Date {
  return new Date(Date.now() + PAIRING_CODE_TTL_MS);
}
