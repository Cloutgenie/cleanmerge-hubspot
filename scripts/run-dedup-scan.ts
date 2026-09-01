import "dotenv/config";
import { loadConfig } from "../src/config.js";
import { runDedupScan } from "../src/dedup/engine.js";
import { DedupStore } from "../src/dedup/store.js";
import { OAuthTokenManager } from "../src/token-manager.js";
import { PostgresTokenStore } from "../src/token-store.js";

const portalId = Number(process.argv[2] ?? process.env.DEDUP_PORTAL_ID);
if (!portalId) throw new Error("Usage: tsx scripts/run-dedup-scan.ts <portalId>  (or set DEDUP_PORTAL_ID)");

const config = loadConfig();
if (!config.DATABASE_URL || !config.TOKEN_ENCRYPTION_KEY) throw new Error("DATABASE_URL and TOKEN_ENCRYPTION_KEY are required to run a dedup scan");

const tokenStore = new PostgresTokenStore(config.DATABASE_URL, config.TOKEN_ENCRYPTION_KEY);
await tokenStore.initialize();
const tokenManager = new OAuthTokenManager(config, tokenStore);

const dedupStore = new DedupStore(config.DATABASE_URL);
await dedupStore.initialize();

const summaries = await runDedupScan(portalId, tokenManager, dedupStore);

for (const summary of summaries) {
  console.log(`\n${summary.objectType}: scanned ${summary.recordsScanned} records, scored ${summary.candidatePairsScored} pairs`);
  console.log(`  high confidence: ${summary.highConfidence}  |  ambiguous: ${summary.ambiguous}  |  discarded: ${summary.discarded}`);
  if (summary.topCandidates.length > 0) {
    console.log(`  top candidates:`);
    for (const candidate of summary.topCandidates) {
      const label = (props: Record<string, string | null>) =>
        summary.objectType === "COMPANY"
          ? `${props.name ?? "(no name)"} <${props.domain ?? "no domain"}>`
          : `${props.firstname ?? ""} ${props.lastname ?? ""} <${props.email ?? "no email"}>`.trim();
      console.log(`    [${candidate.result.tier.toUpperCase()} ${candidate.result.score.toFixed(2)}] ${candidate.recordAId} ${label(candidate.propertiesA)}  <->  ${candidate.recordBId} ${label(candidate.propertiesB)}`);
    }
  }
}

await dedupStore.close();
