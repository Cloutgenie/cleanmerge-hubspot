import "dotenv/config";
import type { Express } from "express";
import { createApp, type DedupDeps } from "./app.js";
import { loadConfig } from "./config.js";
import { DedupStore } from "./dedup/store.js";
import { OAuthTokenManager } from "./token-manager.js";
import { MemoryTokenStore, PostgresTokenStore } from "./token-store.js";

const config = loadConfig();
const tokenStore = config.DATABASE_URL && config.TOKEN_ENCRYPTION_KEY
  ? new PostgresTokenStore(config.DATABASE_URL, config.TOKEN_ENCRYPTION_KEY)
  : new MemoryTokenStore();
await tokenStore.initialize();

let dedup: DedupDeps | undefined;
if (config.DATABASE_URL) {
  const dedupStore = new DedupStore(config.DATABASE_URL);
  await dedupStore.initialize();
  dedup = { tokenManager: new OAuthTokenManager(config, tokenStore), dedupStore };
}

const app: Express = createApp(config, tokenStore, dedup);

if (process.env.VERCEL !== "1") {
  app.listen(config.PORT, () => console.log(`CleanMerge listening on port ${config.PORT}`));
}

export default app;
