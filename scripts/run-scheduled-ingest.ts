import "dotenv/config";

const baseUrl = process.env.INGEST_TARGET_BASE_URL ?? process.env.SCAN_TARGET_BASE_URL;
const adminToken = process.env.INTERNAL_ADMIN_TOKEN;
const portalId = process.env.INGEST_PORTAL_ID;
const connectionId = process.env.INGEST_CONNECTION_ID;
if (!baseUrl || !adminToken || !portalId || !connectionId) {
  throw new Error("INGEST_TARGET_BASE_URL (or SCAN_TARGET_BASE_URL), INTERNAL_ADMIN_TOKEN, INGEST_PORTAL_ID, and INGEST_CONNECTION_ID are required");
}

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/internal/ingest/run`, {
  method: "POST",
  headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
  body: JSON.stringify({ portalId: Number(portalId), connectionId: Number(connectionId) }),
});
if (!response.ok) throw new Error(`Scheduled ingest run failed (${response.status}): ${await response.text()}`);

const { summaries } = (await response.json()) as {
  summaries: Array<{ objectType: string; rowsRead: number; rowsCreated: number; rowsUpdated: number; rowsQueuedForReview: number; rowsErrored: number }>;
};
for (const summary of summaries) {
  console.log(
    `${summary.objectType}: read ${summary.rowsRead}, created ${summary.rowsCreated}, updated ${summary.rowsUpdated}, ` +
    `queued for review ${summary.rowsQueuedForReview}, errored ${summary.rowsErrored}`,
  );
}
