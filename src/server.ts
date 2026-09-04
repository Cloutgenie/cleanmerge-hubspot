import "dotenv/config";
import type { Express } from "express";
import { createApp, type ContactGateDeps, type DedupDeps, type IngestDeps } from "./app.js";
import { ContactGateStore } from "./contact-gate/store.js";
import { loadConfig } from "./config.js";
import { judgeCandidate } from "./dedup/ai-judgment.js";
import { DedupStore } from "./dedup/store.js";
import { IngestStore } from "./ingest/store.js";
import { MemoryPairingStore, PostgresPairingStore } from "./pairing-store.js";
import { OAuthTokenManager } from "./token-manager.js";
import { MemoryTokenStore, PostgresTokenStore } from "./token-store.js";

const config = loadConfig();
const tokenStore = config.DATABASE_URL && config.TOKEN_ENCRYPTION_KEY
  ? new PostgresTokenStore(config.DATABASE_URL, config.TOKEN_ENCRYPTION_KEY)
  : new MemoryTokenStore();
await tokenStore.initialize();

const pairingStore = config.DATABASE_URL ? new PostgresPairingStore(config.DATABASE_URL) : new MemoryPairingStore();
await pairingStore.initialize();

let dedup: DedupDeps | undefined;
let dedupStore: DedupStore | undefined;
if (config.DATABASE_URL) {
  dedupStore = new DedupStore(config.DATABASE_URL);
  await dedupStore.initialize();
  dedup = {
    tokenManager: new OAuthTokenManager(config, tokenStore),
    dedupStore,
    judge: config.ANTHROPIC_API_KEY
      ? (objectType, propertiesA, propertiesB, breakdown) => judgeCandidate(config.ANTHROPIC_API_KEY!, objectType, propertiesA, propertiesB, breakdown)
      : undefined,
  };
}

let ingest: IngestDeps | undefined;
if (config.DATABASE_URL && config.TOKEN_ENCRYPTION_KEY && dedupStore) {
  const ingestStore = new IngestStore(config.DATABASE_URL, config.TOKEN_ENCRYPTION_KEY);
  await ingestStore.initialize();
  ingest = { tokenManager: new OAuthTokenManager(config, tokenStore), ingestStore, dedupStore };
}

let contactGate: ContactGateDeps | undefined;
if (config.DATABASE_URL) {
  const contactGateStore = new ContactGateStore(config.DATABASE_URL);
  await contactGateStore.initialize();
  contactGate = { tokenManager: new OAuthTokenManager(config, tokenStore), contactGateStore };
}

const app: Express = createApp(config, tokenStore, dedup, ingest, contactGate, pairingStore);

if (process.env.VERCEL !== "1") {
  app.listen(config.PORT, () => console.log(`CleanMerge listening on port ${config.PORT}`));
}

export default app;
