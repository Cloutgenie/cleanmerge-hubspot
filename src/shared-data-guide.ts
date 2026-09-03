/**
 * Reference content for the "Shared Data" section of a HubSpot Marketplace listing.
 * https://developers.hubspot.com/docs/apps/developer-platform/list-apps/listing-your-app/app-marketplace-listing-requirements
 * ("All objects selected in your OAuth scopes should be documented... If requesting both read
 * and write, the sync should be advertised as bi-directional for those objects.")
 *
 * This is filled into HubSpot's own listing editor, not linked as an external URL — this page
 * exists so the content is written once, accurately, and ready to copy in when the listing is
 * built, rather than reconstructed from memory at that point.
 */
export function renderSharedDataGuide(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CleanMerge Shared Data</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Karla:wght@400;500;600&family=Space+Grotesk:wght@300;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #03090e; --panel: #020e24; --panel-alt: #010b15;
    --border: rgba(255, 255, 255, 0.16); --text: #ffffff; --text-muted: rgba(255, 255, 255, 0.65);
    --accent: #89bef3; --accent-strong: #5fa7e7; --warn: #f3c86b;
  }
  * { box-sizing: border-box; }
  body { font-family: "Karla", -apple-system, sans-serif; background: var(--bg); color: var(--text); max-width: 820px; margin: 0 auto; padding: 3rem 1.5rem 5rem; line-height: 1.6; }
  h1 { font-family: "Space Grotesk", -apple-system, sans-serif; font-weight: 300; font-size: 2.1rem; margin-bottom: 0.5rem; }
  h2 { font-family: "Space Grotesk", -apple-system, sans-serif; font-weight: 500; font-size: 1.3rem; margin-top: 2.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
  .lede { color: var(--text-muted); font-size: 1.02rem; margin-bottom: 2rem; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.6rem 0.8rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--text-muted); font-weight: 500; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.03em; }
  .badge { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
  .badge-bidirectional { background: rgba(111, 211, 161, 0.15); color: #6fd3a1; }
  code { background: var(--panel-alt); border: 1px solid var(--border); border-radius: 4px; padding: 0.1rem 0.4rem; font-size: 0.88em; }
  .callout { background: rgba(243, 200, 107, 0.08); border: 1px solid rgba(243, 200, 107, 0.3); border-left: 3px solid var(--warn); border-radius: 8px; padding: 1rem 1.2rem; margin: 1.25rem 0; font-size: 0.92rem; }
  .callout strong { color: var(--warn); }
  a { color: var(--accent); }
</style>
</head>
<body>

<h1>Shared Data — CleanMerge</h1>
<p class="lede">Reference content for the "Shared Data" section of the HubSpot Marketplace listing — describes exactly how CleanMerge's requested OAuth scopes are currently used. This is written to be accurate as of today's build, not aspirational.</p>

<div class="callout">
<strong>Write scopes are back, and still not installer-facing.</strong> CleanMerge now requests write access to Companies and Contacts again (plus schema-write, for creating custom properties) to support two capabilities: the merge executor (finds and merges duplicate records) and a new warehouse-ingest pipeline (creates/updates records from a customer-configured data-lake query). Both remain reachable only via internal admin endpoints, configured per customer by CleanMerge's operator — not self-serve for installers. The scopes are requested because these capabilities are real, deployed, and actively used (just not yet installer-triggered), not held speculatively.
</div>

<h2>Contacts</h2>
<table>
<tr><th>Scope requested</th><td><code>crm.objects.contacts.read</code>, <code>crm.objects.contacts.write</code>, <code>crm.schemas.contacts.write</code></td></tr>
<tr><th>Direction</th><td><span class="badge badge-bidirectional">Bidirectional</span></td></tr>
<tr><th>Fields</th><td><code>firstname</code>, <code>lastname</code>, <code>email</code>, <code>phone</code>, plus any warehouse-mapped custom properties</td></tr>
<tr><th>How it's actually used</th><td>
  The <strong>CleanMerge: Normalize CRM Data</strong> workflow action does not call HubSpot's CRM API at all — HubSpot's own workflow engine passes the selected property's value into the action and writes the returned value back to whichever property the workflow is configured to update. CleanMerge never reads or writes a Contact record directly for this feature.<br><br>
  The read/write scopes support two internal-admin capabilities: the duplicate-detection and merge engine (reads Contacts to find likely duplicates; on a human-approved or high-confidence match, normalizes and merges via HubSpot's Merge API), and the warehouse-ingest pipeline (reads Contacts to match incoming warehouse rows against existing records; creates a new Contact or updates a matched one, and can create a custom property via the schema-write scope if a mapping calls for a field that doesn't exist yet).
</td></tr>
</table>

<h2>Companies</h2>
<table>
<tr><th>Scope requested</th><td><code>crm.objects.companies.read</code>, <code>crm.objects.companies.write</code>, <code>crm.schemas.companies.write</code></td></tr>
<tr><th>Direction</th><td><span class="badge badge-bidirectional">Bidirectional</span></td></tr>
<tr><th>Fields</th><td><code>name</code>, <code>domain</code>, <code>phone</code>, plus any warehouse-mapped custom properties</td></tr>
<tr><th>How it's actually used</th><td>Same as Contacts above — the workflow action doesn't touch Company records directly; read/write is used by the merge engine and the warehouse-ingest pipeline.</td></tr>
</table>

<h2>Conversations &amp; Owners (optional scopes)</h2>
<table>
<tr><th>Scope requested</th><td><code>conversations.read</code>, <code>crm.objects.owners.read</code> &mdash; requested as <strong>optional</strong> scopes, not required for every installer</td></tr>
<tr><th>Direction</th><td><span class="badge badge-bidirectional">Read only</span></td></tr>
<tr><th>Fields</th><td>A created Contact's <code>hs_object_source_label</code> (to tell whether it came from Conversations); HubSpot Owner id/email</td></tr>
<tr><th>How it's actually used</th><td>
  Supports Contact Gate: a reverse-quarantine tool for Contacts HubSpot auto-creates from unknown Conversations/Help Desk senders. On a <code>contact.creation</code> webhook, CleanMerge checks the new Contact's source label &mdash; if it's Conversations and the portal's policy says to quarantine it, the Contact is archived within seconds and held in a review queue for a human to promote or discard, rather than staying in the CRM. Every portal defaults to a dry-run mode (log the decision, never delete) until manually confirmed safe for that account. Owners are only used to bulk-seed an allowlist of staff email addresses, on request.<br><br>
  Kept optional rather than required because most installers only use the free workflow action and never touch Contact Gate &mdash; this scope is only requested when walking a specific customer through setup for this feature, not from every installer by default.
</td></tr>
</table>

<h2>If/when this becomes installer-facing</h2>
<p>The review queue, merge executor, and warehouse-ingest configuration are all real and deployed, but reachable only by CleanMerge's operator via internal admin endpoints today — not by installers. If/when any of these become self-serve, this page should be updated to reflect installers configuring and triggering them directly, rather than requesting it on their behalf.</p>

</body>
</html>`;
}
