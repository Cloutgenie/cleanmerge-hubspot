import { z } from "zod";

export const warehouseOptions = ["Databricks", "Snowflake", "BigQuery", "Postgres", "Redshift", "Other / not sure"] as const;
export const objectOptions = ["Contacts", "Companies"] as const;
export const rowVolumeOptions = ["Under 10,000 rows", "10,000 - 100,000 rows", "100,000 - 1 million rows", "Over 1 million rows", "Not sure"] as const;
export const frequencyOptions = ["Hourly", "Daily", "Weekly", "Not sure yet"] as const;
export const timelineOptions = ["As soon as possible", "Within a month", "Within a quarter", "Just exploring"] as const;

export const quoteSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.string().trim().email("Enter a valid work email.").max(200),
  company: z.string().trim().min(1, "Enter your company name.").max(160),
  hubspotPortalId: z.string().trim().regex(/^\d{1,12}$/, "The HubSpot account ID is digits only.").optional().or(z.literal("").transform(() => undefined)),
  warehouse: z.enum(warehouseOptions, { message: "Choose where your data lives." }),
  objects: z.array(z.enum(objectOptions)).min(1, "Choose at least one HubSpot object to sync."),
  rowVolume: z.enum(rowVolumeOptions, { message: "Choose an approximate size." }),
  frequency: z.enum(frequencyOptions, { message: "Choose how often it should sync." }),
  connections: z.coerce.number().int().min(1, "Enter at least 1.").max(50, "For more than 50 connections, add a note and we will follow up."),
  timeline: z.enum(timelineOptions, { message: "Choose a timeline." }),
  notes: z.string().trim().max(2000, "Keep notes under 2,000 characters.").optional().or(z.literal("").transform(() => undefined)),
});

export type QuoteFormValues = Record<string, string | string[] | undefined>;

export function normalizeQuoteBody(body: Record<string, unknown>): Record<string, unknown> {
  const objects = body.objects;
  return { ...body, objects: Array.isArray(objects) ? objects : typeof objects === "string" ? [objects] : [] };
}

function esc(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const head = (title: string) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Karla:wght@400;500;600&family=Space+Grotesk:wght@300;500&display=swap" rel="stylesheet">
<style>
  :root { --bg: #03090e; --panel: #020e24; --border: rgba(255,255,255,0.16); --text: #fff; --text-muted: rgba(255,255,255,0.65); --accent: #89bef3; --accent-strong: #5fa7e7; --good: #6fd3a1; --bad: #f2a1a1; }
  * { box-sizing: border-box; }
  body { font-family: "Karla", -apple-system, sans-serif; background: var(--bg); color: var(--text); margin: 0 auto; padding: 2.5rem 1.5rem 3rem; max-width: 720px; line-height: 1.6; }
  h1 { font-family: "Space Grotesk", -apple-system, sans-serif; font-weight: 300; font-size: 2.2rem; margin: 0 0 0.5rem; }
  h2 { font-family: "Space Grotesk", -apple-system, sans-serif; font-weight: 500; font-size: 1.05rem; color: var(--accent); margin: 2rem 0 0.75rem; }
  .lede { color: var(--text-muted); margin: 0 0 1.5rem; }
  label, legend { display: block; font-weight: 500; font-size: 0.92rem; margin-bottom: 0.3rem; }
  .hint { color: var(--text-muted); font-size: 0.82rem; font-weight: 400; }
  input[type=text], input[type=email], input[type=number], select, textarea { width: 100%; padding: 0.65rem 0.8rem; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font: inherit; }
  input:focus, select:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  textarea { min-height: 110px; resize: vertical; }
  .field { margin-bottom: 1.1rem; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  @media (max-width: 600px) { .row { grid-template-columns: 1fr; } }
  fieldset { border: 0; padding: 0; margin: 0 0 1.1rem; }
  .check { display: inline-flex; align-items: center; gap: 0.5rem; margin-right: 1.5rem; font-weight: 400; }
  .err { color: var(--bad); font-size: 0.85rem; margin-top: 0.3rem; }
  .banner { border: 1px solid var(--bad); border-radius: 8px; padding: 0.8rem 1rem; margin-bottom: 1.5rem; color: var(--bad); }
  .hp { position: absolute; left: -9999px; }
  button { padding: 0.75rem 1.7rem; background: var(--good); color: #04180e; border: 0; border-radius: 999px; font-family: "Space Grotesk", -apple-system, sans-serif; font-weight: 500; font-size: 0.98rem; cursor: pointer; }
  button:hover { background: #86e0b6; }
  a { color: var(--accent); }
  footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.85rem; }
</style>
</head>
<body>`;

const foot = `<footer>CleanMerge &middot; Questions? <a href="mailto:jay@kinetify.com">jay@kinetify.com</a> &middot; <a href="/docs/pricing">Pricing</a> &middot; <a href="/docs/privacy">Privacy Policy</a> &middot; <a href="/docs/terms">Terms of Service</a></footer>
</body>
</html>`;

function select(name: string, options: readonly string[], values: QuoteFormValues, placeholder: string): string {
  const current = values[name];
  return `<select name="${name}" id="${name}" required><option value="">${placeholder}</option>${options
    .map((o) => `<option value="${esc(o)}"${current === o ? " selected" : ""}>${esc(o)}</option>`)
    .join("")}</select>`;
}

export function renderQuoteForm(values: QuoteFormValues = {}, errors: Record<string, string> = {}): string {
  const err = (k: string) => (errors[k] ? `<div class="err">${esc(errors[k])}</div>` : "");
  const selectedObjects = Array.isArray(values.objects) ? values.objects : [];
  return `${head("Request a Warehouse Sync quote")}
<h1>Request a Warehouse Sync quote</h1>
<p class="lede">Tell us a little about your setup and we will reply with a written quote, usually within one business day. Plans start at $299 a month per connection, based on how many rows you sync, plus a one-time setup fee. Your quote shows the exact amounts. Submitting this form does not commit you to anything and you will not be charged.</p>
${Object.keys(errors).length ? `<div class="banner" role="alert">Please fix the highlighted fields and submit again.</div>` : ""}
<form method="post" action="/docs/quote">
  <div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>

  <h2>About you</h2>
  <div class="row">
    <div class="field"><label for="name">Your name</label><input type="text" id="name" name="name" required maxlength="120" value="${esc(values.name)}">${err("name")}</div>
    <div class="field"><label for="email">Work email</label><input type="email" id="email" name="email" required maxlength="200" value="${esc(values.email)}">${err("email")}</div>
  </div>
  <div class="row">
    <div class="field"><label for="company">Company</label><input type="text" id="company" name="company" required maxlength="160" value="${esc(values.company)}">${err("company")}</div>
    <div class="field"><label for="hubspotPortalId">HubSpot account ID <span class="hint">(optional)</span></label><input type="text" id="hubspotPortalId" name="hubspotPortalId" inputmode="numeric" maxlength="12" value="${esc(values.hubspotPortalId)}"><div class="hint">Shown in HubSpot under your account name in the top right.</div>${err("hubspotPortalId")}</div>
  </div>

  <h2>Your data</h2>
  <div class="field"><label for="warehouse">Where does your data live?</label>${select("warehouse", warehouseOptions, values, "Choose one")}${err("warehouse")}</div>
  <fieldset><legend>What should sync into HubSpot?</legend>${objectOptions
    .map((o) => `<label class="check"><input type="checkbox" name="objects" value="${o}"${selectedObjects.includes(o) ? " checked" : ""}> ${o}</label>`)
    .join("")}${err("objects")}</fieldset>
  <div class="row">
    <div class="field"><label for="rowVolume">Roughly how many rows?</label>${select("rowVolume", rowVolumeOptions, values, "Choose one")}${err("rowVolume")}</div>
    <div class="field"><label for="frequency">How often should it sync?</label>${select("frequency", frequencyOptions, values, "Choose one")}${err("frequency")}</div>
  </div>
  <div class="row">
    <div class="field"><label for="connections">Number of connections <span class="hint">(separate warehouses or databases)</span></label><input type="number" id="connections" name="connections" min="1" max="50" required value="${esc(values.connections ?? "1")}">${err("connections")}</div>
    <div class="field"><label for="timeline">When do you want to start?</label>${select("timeline", timelineOptions, values, "Choose one")}${err("timeline")}</div>
  </div>

  <h2>Anything else?</h2>
  <div class="field"><label for="notes">Notes <span class="hint">(optional)</span></label><textarea id="notes" name="notes" maxlength="2000">${esc(values.notes)}</textarea><div class="hint">For example, what duplicates you are seeing today or systems that also write to HubSpot. Please do not include passwords or API keys.</div>${err("notes")}</div>

  <button type="submit">Request my quote</button>
</form>
${foot}`;
}

export function renderQuoteThanks(): string {
  return `${head("Quote request received")}
<h1>Thanks, we have your request.</h1>
<p class="lede">We will review your details and email you a written quote, usually within one business day.</p>
<h2>What happens next</h2>
<ol>
  <li>We send you a written quote based on what you told us.</li>
  <li>You confirm the quote in writing.</li>
  <li>We email you a secure payment link.</li>
  <li>Once payment is received, we set up your connection with you.</li>
</ol>
<p>Nothing is charged until you have confirmed a quote. Questions in the meantime? <a href="mailto:jay@kinetify.com">jay@kinetify.com</a></p>
${foot}`;
}
