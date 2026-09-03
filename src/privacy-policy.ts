/**
 * Public Privacy Policy, required for HubSpot Marketplace listing submission.
 * Written to describe what this build of CleanMerge actually does with data today —
 * see src/shared-data-guide.ts and src/dedup/ for the underlying behavior this reflects.
 */
export function renderPrivacyPolicy(): string {
  const effectiveDate = "September 3, 2026";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CleanMerge Privacy Policy</title>
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
  .lede { color: var(--text-muted); font-size: 0.95rem; margin-bottom: 2rem; }
  ul, ol { padding-left: 1.4rem; }
  li { margin: 0.4rem 0; }
  p { margin: 0.9rem 0; }
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
  table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.88rem; }
  th, td { text-align: left; padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--text-muted); font-weight: 500; }
  a { color: var(--accent); }
  footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.85rem; }
</style>
</head>
<body>

<h1>Privacy Policy</h1>
<p class="lede">CleanMerge &middot; Effective ${effectiveDate}</p>

<p>This policy describes what data CleanMerge accesses, stores, and shares when you connect it to a HubSpot account. It is written to match how the app actually behaves today, not aspirationally.</p>

<h2>What CleanMerge accesses</h2>
<p>When you install CleanMerge, HubSpot grants it read-only access to Contact and Company records (via OAuth scopes <code>crm.objects.contacts.read</code> and <code>crm.objects.companies.read</code>) and issues an access/refresh token pair identifying your HubSpot portal.</p>
<table>
<tr><th>Data</th><th>Why we access it</th></tr>
<tr><td>HubSpot OAuth tokens</td><td>To maintain the connection between CleanMerge and your HubSpot account.</td></tr>
<tr><td>Contact fields: <code>firstname</code>, <code>lastname</code>, <code>email</code>, <code>phone</code></td><td>To detect likely duplicate Contact records.</td></tr>
<tr><td>Company fields: <code>name</code>, <code>domain</code>, <code>phone</code></td><td>To detect likely duplicate Company records.</td></tr>
<tr><td>Workflow action input text</td><td>The value you choose to normalize (e.g. a name or phone number) inside a HubSpot workflow.</td></tr>
</table>

<h2>How we use it</h2>
<ul>
  <li><strong>Normalize CRM Data workflow action:</strong> the text value HubSpot passes in is transformed (case conversion, domain extraction, phone formatting, name splitting) and the result is returned to HubSpot's workflow engine. This happens in memory only &mdash; CleanMerge does not store the input or output text, and does not call the HubSpot CRM API for this feature.</li>
  <li><strong>Duplicate detection:</strong> Contact and Company field values are periodically read from your HubSpot portal to identify records that likely refer to the same person or company. Candidate duplicate pairs, their similarity scores, and (for ambiguous cases) an AI-generated judgment are stored so they can be reviewed. This tooling is currently operated internally by CleanMerge's developer and is not yet self-serve for installers.</li>
</ul>

<h2>Third parties we share data with</h2>
<table>
<tr><th>Party</th><th>What they receive</th><th>Why</th></tr>
<tr><td>Anthropic (Claude API)</td><td>Contact or Company field values for a specific candidate pair (e.g. two names, emails, or phone numbers being compared)</td><td>Only for pairs deterministic scoring can't confidently resolve, to get an AI judgment on whether they're the same real-world entity. Never sent for high-confidence or clearly-different pairs.</td></tr>
<tr><td>Railway (hosting)</td><td>All data described above, as our infrastructure and database provider</td><td>CleanMerge's server and database run on Railway's infrastructure.</td></tr>
<tr><td>HubSpot</td><td>N/A &mdash; HubSpot is the source of this data, not a recipient</td><td>&mdash;</td></tr>
</table>
<p>We do not sell your data, and we do not share it with any party not listed above.</p>

<h2>Storage and security</h2>
<ul>
  <li>OAuth tokens are encrypted at rest (AES-256-GCM) before being stored.</li>
  <li>Data in transit is encrypted via TLS.</li>
  <li>Duplicate-candidate records (field snapshots, scores, AI judgments) are stored in our Postgres database, scoped to your HubSpot portal ID.</li>
</ul>

<div class="callout">
<strong>Data deletion:</strong> Uninstalling CleanMerge from HubSpot immediately stops it from accessing your data going forward, but does not automatically delete data already stored (OAuth tokens and duplicate-candidate records). To request deletion, email us at <a href="mailto:jgauthier@taskdropoff.com">jgauthier@taskdropoff.com</a> and we will delete it. We are working toward automatic deletion on uninstall; until then, deletion requests are handled manually.
</div>

<h2>Your rights</h2>
<p>You can request a copy of the data we hold about your portal, or request its deletion, at any time by emailing <a href="mailto:jgauthier@taskdropoff.com">jgauthier@taskdropoff.com</a>.</p>

<h2>Children's privacy</h2>
<p>CleanMerge is a business tool intended for use by HubSpot customers and is not directed at children. We do not knowingly collect data from children.</p>

<h2>Changes to this policy</h2>
<p>If we change what data we collect or how we use it, we will update this page and revise the effective date above.</p>

<footer>CleanMerge &middot; Questions? <a href="mailto:jgauthier@taskdropoff.com">jgauthier@taskdropoff.com</a></footer>
</body>
</html>`;
}
