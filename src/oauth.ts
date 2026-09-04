import crypto from "node:crypto";
import type { Request, Response } from "express";
import type { Config } from "./config.js";
import type { PairingStore } from "./pairing-store.js";
import { generatePairingCode, pairingCodeExpiry } from "./session.js";
import type { TokenStore } from "./token-store.js";
import type { OAuthTokens } from "./types.js";

interface StatePayload { nonce: string; exp: number }

function signState(config: Config): string {
  const payload = Buffer.from(JSON.stringify({ nonce: crypto.randomUUID(), exp: Date.now() + 10 * 60_000 } satisfies StatePayload)).toString("base64url");
  const signature = crypto.createHmac("sha256", config.HUBSPOT_CLIENT_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyState(state: string, config: Config): boolean {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return false;
  const expected = crypto.createHmac("sha256", config.HUBSPOT_CLIENT_SECRET).update(payload).digest("base64url");
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;
  try { return (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StatePayload).exp > Date.now(); }
  catch { return false; }
}

async function exchangeCode(code: string, config: Config): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.HUBSPOT_CLIENT_ID,
    client_secret: config.HUBSPOT_CLIENT_SECRET,
    redirect_uri: config.HUBSPOT_REDIRECT_URI,
    code,
  });
  const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body,
  });
  if (!response.ok) throw new Error(`HubSpot token exchange failed (${response.status})`);
  const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number; hub_id?: number; scopes?: string[] };
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000, hubId: data.hub_id, scopes: data.scopes ?? [] };
}

export function oauthHandlers(config: Config, store: TokenStore, pairingStore?: PairingStore) {
  return {
    install(_req: Request, res: Response): void {
      const params: Record<string, string> = {
        client_id: config.HUBSPOT_CLIENT_ID,
        redirect_uri: config.HUBSPOT_REDIRECT_URI,
        scope: config.HUBSPOT_SCOPES.split(/[ ,]+/).filter(Boolean).join(" "),
        state: signState(config),
      };
      // Optional scopes (e.g. conversations.read, crm.objects.owners.read for Contact Gate) are
      // unset for ordinary installers and only set when walking a specific customer through
      // reauthorization for that feature — HubSpot shows these as opt-in on the consent screen
      // rather than forcing every installer to grant them.
      const optionalScope = (config.HUBSPOT_OPTIONAL_SCOPES ?? "").split(/[ ,]+/).filter(Boolean).join(" ");
      if (optionalScope) params.optional_scope = optionalScope;
      const query = new URLSearchParams(params);
      res.redirect(`https://app.hubspot.com/oauth/authorize?${query.toString()}`);
    },
    async callback(req: Request, res: Response): Promise<void> {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      if (!code || !verifyState(state, config)) {
        console.error("OAuth callback rejected", { hasCode: Boolean(code), hasState: Boolean(state), stateValid: state ? verifyState(state, config) : false, queryKeys: Object.keys(req.query) });
        res.status(400).json({ error: "Invalid OAuth callback" });
        return;
      }
      try {
        const tokens = await exchangeCode(code, config);
        if (!tokens.hubId) { res.status(502).json({ error: "HubSpot did not return a portal ID" }); return; }
        await store.set(tokens.hubId, tokens);

        let pairingHtml = "<p>You may close this window.</p>";
        if (pairingStore) {
          const pairingCode = generatePairingCode();
          await pairingStore.create(pairingCode, tokens.hubId, pairingCodeExpiry());
          pairingHtml = `
            <p>To finish setup, open HubSpot &rarr; Settings &rarr; Apps &rarr; CleanMerge and enter this code:</p>
            <p style="font-size:1.8rem;font-weight:700;letter-spacing:0.08em;font-family:monospace">${pairingCode}</p>
            <p>This code expires in 15 minutes. You may close this window once you've entered it.</p>`;
        }
        res.status(200).type("html").send(`<!doctype html><title>CleanMerge installed</title><h1>CleanMerge is connected.</h1>${pairingHtml}`);
      } catch (error) {
        console.error("OAuth callback failed", error instanceof Error ? error.message : error);
        res.status(502).json({ error: "Could not complete HubSpot OAuth" });
      }
    },
  };
}
