import "dotenv/config";

const baseUrl = process.env.SCAN_TARGET_BASE_URL;
const adminToken = process.env.INTERNAL_ADMIN_TOKEN;
const portalId = process.env.DEDUP_PORTAL_ID;
if (!baseUrl || !adminToken || !portalId) {
  throw new Error("SCAN_TARGET_BASE_URL, INTERNAL_ADMIN_TOKEN, and DEDUP_PORTAL_ID are required");
}

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/dedup/scan`, {
  method: "POST",
  headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
  body: JSON.stringify({ portalId: Number(portalId) }),
});
if (!response.ok) throw new Error(`Scheduled scan failed (${response.status}): ${await response.text()}`);

const { summaries } = (await response.json()) as { summaries: Array<{ objectType: string; recordsScanned: number; highConfidence: number; ambiguous: number }> };
for (const summary of summaries) {
  console.log(`${summary.objectType}: scanned ${summary.recordsScanned}, high-confidence ${summary.highConfidence}, ambiguous ${summary.ambiguous}`);
}
