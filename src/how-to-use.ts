/**
 * Public "How to Use" guide — a feature-by-feature walkthrough for installers who don't have a
 * recorded demo video to follow. Same template/style as setup-guide.ts and the other docs pages.
 */
export function renderHowToUse(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>How to Use CleanMerge</title>
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
    max-width: 760px;
    margin: 0 auto;
    padding: 3rem 1.5rem 5rem;
    line-height: 1.6;
  }
  h1 {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 300;
    font-size: 2.1rem;
    margin-bottom: 0.5rem;
  }
  h2 {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 500;
    font-size: 1.35rem;
    margin-top: 2.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  .lede { color: var(--text-muted); font-size: 1.05rem; margin-bottom: 2rem; }
  ol, ul { padding-left: 1.4rem; }
  li { margin: 0.5rem 0; }
  .step-note {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.9rem 1.1rem;
    margin: 0.75rem 0;
    font-size: 0.92rem;
  }
  .callout {
    background: rgba(137, 190, 243, 0.08);
    border: 1px solid rgba(137, 190, 243, 0.25);
    border-left: 3px solid var(--accent-strong);
    border-radius: 8px;
    padding: 0.9rem 1.1rem;
    margin: 1rem 0;
    font-size: 0.92rem;
  }
  .callout strong { color: var(--accent); }
  code {
    background: var(--panel-alt);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.88em;
  }
  a { color: var(--accent); }
  .transform-table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.9rem; }
  .transform-table th, .transform-table td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); }
  .transform-table th { color: var(--text-muted); font-weight: 500; }
  footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.85rem; }
</style>
</head>
<body>

<h1>How to Use CleanMerge</h1>
<p class="lede">A feature-by-feature walkthrough of CleanMerge, for anyone setting it up without a recorded demo to follow alongside.</p>

<h2>Overview</h2>
<p>CleanMerge is a HubSpot app with two parts:</p>
<ol>
  <li><strong>Normalize CRM Data</strong> &mdash; a free workflow action available to everyone who installs the app today. It cleans up messy property values (names, phone numbers, URLs) right inside your existing HubSpot workflows.</li>
  <li><strong>Warehouse Sync</strong> &mdash; a paid, white-glove service that syncs your data warehouse into HubSpot with built-in duplicate detection. It's not self-serve yet; setup is arranged directly by email.</li>
</ol>
<p>This guide covers both, with the most detail on the free action since that's what you set up yourself.</p>

<h2>Installing CleanMerge</h2>
<ol>
  <li>Open the install link (from the CleanMerge listing or <a href="/docs/setup">setup guide</a>) and click <strong>Install CleanMerge</strong>.</li>
  <li>You'll land on HubSpot's account chooser &mdash; select the HubSpot account you want to connect.</li>
  <li>Review the requested scopes on the consent screen.
    <div class="callout"><strong>Scopes requested:</strong> a base identity scope, plus read/write access to Companies and Contacts. These support the internal duplicate-matching engine and Warehouse Sync &mdash; the free workflow action itself does not read or write CRM records directly.</div>
  </li>
  <li>Click <strong>Connect app</strong>.</li>
  <li>You'll land on a confirmation page reading "CleanMerge is connected." Installation is complete &mdash; no further configuration is needed.</li>
</ol>

<h2>Setting Up the Normalize CRM Data Action</h2>
<ol>
  <li>In HubSpot, go to <strong>Automation</strong> &rarr; <strong>Workflows</strong>.</li>
  <li>Create or open a workflow that enrolls Contacts, Companies, Deals, or Tickets.</li>
  <li>Click the <strong>+</strong> icon to add an action, then search for <strong>CleanMerge</strong>.</li>
  <li>Select <strong>CleanMerge: Normalize CRM Data</strong>.</li>
  <li>Set <strong>Input text</strong> to the property (or static value) you want to normalize.</li>
  <li>Choose a <strong>Transformation</strong> from the dropdown (see the reference table below).</li>
  <li>Save the action.</li>
</ol>

<h2>Transformation Reference</h2>
<table class="transform-table">
  <tr><th>Transformation</th><th>Example</th></tr>
  <tr><td>Proper Case</td><td><code>JANE DOE</code> &rarr; <code>Jane Doe</code></td></tr>
  <tr><td>Uppercase</td><td><code>jane doe</code> &rarr; <code>JANE DOE</code></td></tr>
  <tr><td>Lowercase</td><td><code>JANE DOE</code> &rarr; <code>jane doe</code></td></tr>
  <tr><td>Extract Domain</td><td><code>https://www.acme.com/about</code> &rarr; <code>acme.com</code></td></tr>
  <tr><td>Format Phone (E.164)</td><td><code>(312) 555-0199</code> &rarr; <code>+13125550199</code></td></tr>
  <tr><td>Split First Name</td><td><code>Jane Doe</code> &rarr; <code>Jane</code></td></tr>
  <tr><td>Split Last Name</td><td><code>Jane Doe</code> &rarr; <code>Doe</code></td></tr>
</table>

<h2>The Critical Step: Set Property Value</h2>
<p>CleanMerge only <em>computes</em> the cleaned-up value &mdash; it does not write it to the record by itself. Right after the CleanMerge action in your workflow, you must add a second action:</p>
<ol>
  <li>Click <strong>+</strong> again, immediately after the CleanMerge action.</li>
  <li>Choose <strong>Set property value</strong>.</li>
  <li>Set the property to update (e.g. the same field you normalized, or a different one).</li>
  <li>For the value, select CleanMerge's output field, <strong>Normalized text</strong>.</li>
  <li>Save the workflow.</li>
</ol>
<div class="callout"><strong>Easy to miss:</strong> skip this step and the workflow will still run without errors &mdash; but nothing on the record will actually change, because CleanMerge only hands back a value; HubSpot's own "Set property value" step is what writes it.</div>

<h2>How It Works Under the Hood</h2>
<p>When a record reaches the CleanMerge step, HubSpot sends over just the one value you're transforming &mdash; nothing else about the record. CleanMerge cleans it up and sends the result straight back, in the same instant. Nothing is stored on CleanMerge's side; the value only exists for that one round trip.</p>
<p>The actual write to your CRM record happens back in HubSpot, through the "Set property value" step described above &mdash; the same way any other workflow action works.</p>
<p>This is also why the free action doesn't need read or write access to your Contacts or Companies: it's a pass-through cleanup step, not a system that holds a copy of your data.</p>

<h2>Data &amp; Security</h2>
<ul>
  <li>All traffic between HubSpot and CleanMerge is encrypted in transit (TLS).</li>
  <li>OAuth tokens are encrypted at rest (AES-256-GCM).</li>
  <li>The free Normalize CRM Data action never stores the values it transforms &mdash; see "How It Works Under the Hood" above.</li>
  <li>Full details on what data is accessed, why, and how to request deletion: <a href="/docs/privacy">Privacy Policy</a>.</li>
</ul>

<h2>Free Tier Limits</h2>
<p>The free action allows up to 50 runs per month per account, across any number of workflows. Past that, the action returns the original value unchanged, with a status message pointing to Warehouse Sync &mdash; it will not fail your workflow or block enrollment, it simply stops normalizing until the next month.</p>

<h2>FAQ &amp; Troubleshooting</h2>
<p><strong>Why didn't my property update?</strong><br>
The most common cause is a missing "Set property value" step right after CleanMerge &mdash; see "The Critical Step: Set Property Value" above. CleanMerge computes the value; that second step is what writes it to the record.</p>
<p><strong>What happens if a phone number can't be formatted?</strong><br>
CleanMerge returns the original value unchanged, with an error status, rather than failing the workflow. Check the workflow's history log for the specific record to see the error detail.</p>
<p><strong>How do I get Warehouse Sync?</strong><br>
Email <a href="mailto:jay@kinetify.com">jay@kinetify.com</a> &mdash; it's arranged directly, starting with a conversation about your warehouse and the data you want synced.</p>

<footer>CleanMerge &middot; Questions? <a href="mailto:jay@kinetify.com">jay@kinetify.com</a> &middot; <a href="/docs/setup">Setup Guide</a> &middot; <a href="/docs/pricing">Pricing</a> &middot; <a href="/docs/privacy">Privacy Policy</a> &middot; <a href="/docs/terms">Terms of Service</a></footer>
</body>
</html>`;
}
