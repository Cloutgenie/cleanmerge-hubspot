import "dotenv/config";
import type { Express } from "express";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { MemoryTokenStore, PostgresTokenStore } from "./token-store.js";

const config = loadConfig();
const tokenStore = config.DATABASE_URL && config.TOKEN_ENCRYPTION_KEY
  ? new PostgresTokenStore(config.DATABASE_URL, config.TOKEN_ENCRYPTION_KEY)
  : new MemoryTokenStore();
await tokenStore.initialize();
const app: Express = createApp(config, tokenStore);

if (process.env.VERCEL !== "1") {
  app.listen(config.PORT, () => console.log(`CleanMerge listening on port ${config.PORT}`));
}

export default app;
