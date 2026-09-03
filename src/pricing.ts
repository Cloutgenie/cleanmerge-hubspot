/**
 * Public pricing page, required for HubSpot Marketplace listing submission.
 * Warehouse Sync is white-glove/managed today (config happens via internal admin endpoints,
 * not a self-serve UI) — priced and described accordingly, not as instant self-serve SaaS.
 */
export function renderPricing(installUrl: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CleanMerge Pricing</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Karla:wght@400;500;600&family=Space+Grotesk:wght@300;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #03090e;
    --panel: #020e24;
    --panel-alt: #010b15;
    --border: rgba(255, 255, 255, 0.16);
    --text: #ffffff;
    --text-muted: rgba(255, 255, 255, 0.65);
    --accent: #89bef3;
    --accent-strong: #5fa7e7;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Karla", -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    max-width: 780px;
    margin: 0 auto;
    padding: 3rem 1.5rem 5rem;
    line-height: 1.65;
  }
  h1 {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 300;
    font-size: 2.1rem;
    margin-bottom: 0.4rem;
  }
  h2 {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 500;
    font-size: 1.25rem;
    margin-top: 2.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  .lede { color: var(--text-muted); font-size: 1.02rem; margin-bottom: 2rem; }
  .plans { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin: 1.5rem 0; }
  @media (max-width: 640px) { .plans { grid-template-columns: 1fr; } }
  .plan {
    background: var(--panel);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent-strong);
    border-radius: 10px;
    padding: 1.5rem 1.75rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
  }
  .plan.featured { border-left-color: #6fd3a1; }
  .plan-eyebrow {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 500;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6fd3a1;
    margin-bottom: 0.3rem;
  }
  .plan-name {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 500;
    font-size: 1.15rem;
    color: var(--accent);
  }
  .plan-price {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 300;
    font-size: 2rem;
    margin: 0.4rem 0 1rem;
  }
  .plan-price span { font-size: 0.95rem; color: var(--text-muted); font-family: "Karla", sans-serif; }
  .plan ul { padding-left: 1.2rem; margin: 0.75rem 0 0; flex: 1; }
  .plan li { margin: 0.4rem 0; font-size: 0.94rem; }
  .callout {
    background: rgba(137, 190, 243, 0.08);
    border: 1px solid rgba(137, 190, 243, 0.25);
    border-left: 3px solid var(--accent-strong);
    border-radius: 8px;
    padding: 0.9rem 1.1rem;
    margin: 1.25rem 0;
    font-size: 0.92rem;
  }
  .callout strong { color: var(--accent); }
  .install-btn, .contact-btn {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.65rem 1.4rem;
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 500;
    text-decoration: none;
    border-radius: 999px;
    text-align: center;
    font-size: 0.92rem;
  }
  .install-btn { background: var(--accent); color: #03090e; }
  .install-btn:hover { background: var(--accent-strong); }
  .contact-btn { background: #6fd3a1; color: #04180e; }
  .contact-btn:hover { background: #86e0b6; }
  a { color: var(--accent); }
  footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.85rem; }
</style>
</head>
<body>

<h1>Pricing</h1>
<p class="lede">CleanMerge keeps HubSpot in sync with the rest of your stack — starting with a free CRM-cleanup action, up to fully-managed warehouse sync with duplicate protection built in.</p>

<div class="plans">
  <div class="plan featured">
    <div class="plan-eyebrow">Most popular</div>
    <div class="plan-name">Warehouse Sync</div>
    <div class="plan-price">From $299 <span>/ mo, per connection</span></div>
    <ul>
      <li>Pulls data from any SQL-queryable warehouse (Databricks, or anything with a similar REST/SQL interface) into HubSpot Contacts and Companies.</li>
      <li>Every incoming row is matched against your existing HubSpot records with fuzzy + AI-assisted matching before anything is written — no fresh duplicates from the sync itself.</li>
      <li>Confident matches update automatically; anything ambiguous is queued for a quick human approve/reject instead of guessing.</li>
      <li>Field mapping, including creating new HubSpot properties when your warehouse has data HubSpot doesn't yet.</li>
      <li>Run on your schedule — hourly to weekly.</li>
      <li>White-glove setup: we configure the connection and mappings with you. There's no self-serve UI for this yet, so pricing reflects real setup and monitoring, not a flip-a-switch SaaS tier.</li>
    </ul>
    <div><a class="contact-btn" href="mailto:jgauthier@taskdropoff.com?subject=CleanMerge%20Warehouse%20Sync">Talk to us about Warehouse Sync</a></div>
  </div>

  <div class="plan">
    <div class="plan-name">Free</div>
    <div class="plan-price">$0 <span>/ forever</span></div>
    <ul>
      <li>Unlimited use of the <strong>CleanMerge: Normalize CRM Data</strong> workflow action, in any number of workflows.</li>
      <li>Proper Case, Uppercase, Lowercase, Extract Domain, Format Phone (E.164), Split First/Last Name transformations.</li>
      <li>No card required, no per-record or per-workflow-run charges.</li>
    </ul>
    <div><a class="install-btn" href="${installUrl}">Install CleanMerge</a></div>
  </div>
</div>

<h2>Why not just use a reverse-ETL tool?</h2>
<p>General-purpose warehouse-sync tools (Census, Hightouch, and similar) are built for data teams and typically start in the $350&ndash;800+/mo range before you've synced a single duplicate-free record — they move your data as-is and leave deduplication to you. Warehouse Sync is scoped specifically to HubSpot, includes the duplicate-matching step by default, and is priced for teams who want clean data in HubSpot without standing up a full data-infrastructure tool.</p>

<div class="callout">
<strong>No surprise charges:</strong> per our <a href="/docs/terms">Terms of Service</a>, nothing above the Free plan is billed automatically — Warehouse Sync starts with a conversation, and any pricing we quote is confirmed before setup begins.
</div>

<footer>CleanMerge &middot; Questions? <a href="mailto:jgauthier@taskdropoff.com">jgauthier@taskdropoff.com</a> &middot; <a href="/docs/privacy">Privacy Policy</a> &middot; <a href="/docs/terms">Terms of Service</a></footer>
</body>
</html>`;
}
