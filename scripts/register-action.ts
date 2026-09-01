import "dotenv/config";
import { readFile } from "node:fs/promises";

const appId = process.env.HUBSPOT_APP_ID;
const developerApiKey = process.env.HUBSPOT_DEVELOPER_API_KEY;
const baseUrl = process.env.PUBLIC_BASE_URL;
if (!appId || !developerApiKey || !baseUrl) throw new Error("HUBSPOT_APP_ID, HUBSPOT_DEVELOPER_API_KEY, and PUBLIC_BASE_URL are required");

const definition = JSON.parse(await readFile(new URL("../action-definition.json", import.meta.url), "utf8")) as Record<string, unknown>;
definition.actionUrl = `${baseUrl.replace(/\/$/, "")}/api/hubspot/action`;
const response = await fetch(`https://api.hubapi.com/automation/actions/2026-03/${appId}?hapikey=${encodeURIComponent(developerApiKey)}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(definition),
});
if (!response.ok) throw new Error(`Registration failed (${response.status}): ${await response.text()}`);
console.log(JSON.stringify(await response.json(), null, 2));
