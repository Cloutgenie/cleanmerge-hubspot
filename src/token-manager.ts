import type { Config } from "./config.js";
import type { TokenStore } from "./token-store.js";
import type { OAuthTokens } from "./types.js";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  hub_id?: number;
  scopes?: string[];
}

/** Retrieves a usable access token and transparently refreshes it when near expiry. */
export class OAuthTokenManager {
  constructor(private readonly config: Config, private readonly store: TokenStore) {}

  async getAccessToken(portalId: number): Promise<string> {
    const tokens = await this.store.get(portalId);
    if (!tokens) throw new Error(`No HubSpot OAuth installation found for portal ${portalId}`);
    if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
    const refreshed = await this.refresh(tokens);
    await this.store.set(portalId, refreshed);
    return refreshed.accessToken;
  }

  private async refresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.config.HUBSPOT_CLIENT_ID,
      client_secret: this.config.HUBSPOT_CLIENT_SECRET,
      refresh_token: tokens.refreshToken,
    });
    const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) throw new Error(`HubSpot token refresh failed (${response.status})`);
    const data = await response.json() as TokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokens.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      hubId: data.hub_id ?? tokens.hubId,
      scopes: data.scopes ?? tokens.scopes,
    };
  }
}
