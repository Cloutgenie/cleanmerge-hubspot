/**
 * Public setup documentation, required for HubSpot Marketplace listing (and certification later):
 * https://developers.hubspot.com/docs/apps/developer-platform/list-apps/listing-your-app/create-an-app-listing-setup-guide
 *
 * Deliberately documents only what an installer can self-serve use today (the workflow action).
 * The dedup engine (scan/review/merge) is real and deployed, but only reachable via an internal
 * admin endpoint — not something an installing customer can use yet — so it's left out here
 * rather than describing a feature that wouldn't work for the reader.
 */
export function renderSetupGuide(installUrl: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CleanMerge Setup Guide</title>
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
  .install-btn {
    display: inline-block;
    margin-top: 0.75rem;
    padding: 0.7rem 1.5rem;
    background: var(--accent);
    color: #03090e;
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 500;
    text-decoration: none;
    border-radius: 999px;
  }
  .install-btn:hover { background: var(--accent-strong); }
  a { color: var(--accent); }
  .transform-table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.9rem; }
  .transform-table th, .transform-table td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); }
  .transform-table th { color: var(--text-muted); font-weight: 500; }
  footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.85rem; }
</style>
</head>
<body>

<h1>Setup guide for CleanMerge</h1>
<p class="lede">CleanMerge adds a custom workflow action to HubSpot that normalizes CRM field values — names, phone numbers, and domains — directly inside your existing workflows. This lets you:</p>
<ul>
  <li>Automatically title-case contact and company names as part of a lead-routing or import workflow.</li>
  <li>Extract a clean root domain from a website URL for company matching or segmentation.</li>
  <li>Convert phone numbers to a consistent E.164 format before sending them to SMS or calling tools.</li>
</ul>

<h2>Install the app</h2>
<ol>
  <li>Click the button below to start installation.
    <div><a class="install-btn" href="${installUrl}">Install CleanMerge</a></div>
  </li>
  <li>You'll be redirected to HubSpot's account chooser. Select the HubSpot account you want to connect.</li>
  <li>Review the requested scopes on the consent screen.
    <div class="callout"><strong>Scopes requested:</strong> a base identity scope to connect your account, plus read/write access to Companies and Contacts (used by CleanMerge's data-hygiene tooling; the workflow action itself does not read or write CRM records directly).</div>
  </li>
  <li>Click <strong>Connect app</strong>.</li>
  <li>You'll land on a confirmation page reading "CleanMerge is connected." Installation is complete.</li>
</ol>

<h2>Configure the app</h2>
<p>CleanMerge requires no additional configuration after installation. As soon as it's connected, the <strong>CleanMerge: Normalize CRM Data</strong> action becomes available in any workflow in that HubSpot account.</p>

<h2>Use the app</h2>
<ol>
  <li>In HubSpot, go to <strong>Automation</strong> &rarr; <strong>Workflows</strong>.</li>
  <li>Create or open a workflow that enrolls Contacts, Companies, Deals, or Tickets.</li>
  <li>Click the <strong>+</strong> icon to add an action, then search for <strong>CleanMerge</strong>.</li>
  <li>Select <strong>CleanMerge: Normalize CRM Data</strong>.</li>
  <li>Set <strong>Input text</strong> to the property (or static value) you want to normalize.</li>
  <li>Choose a <strong>Transformation</strong>:
    <table class="transform-table">
      <tr><th>Transformation</th><th>Example</th></tr>
      <tr><td>Proper Case</td><td><code>JANE doe</code> &rarr; <code>Jane Doe</code></td></tr>
      <tr><td>Uppercase</td><td><code>jane doe</code> &rarr; <code>JANE DOE</code></td></tr>
      <tr><td>Lowercase</td><td><code>JANE DOE</code> &rarr; <code>jane doe</code></td></tr>
      <tr><td>Extract Domain</td><td><code>https://www.acme.com/about</code> &rarr; <code>acme.com</code></td></tr>
      <tr><td>Format Phone (E.164)</td><td><code>(312) 555-0199</code> &rarr; <code>+13125550199</code></td></tr>
      <tr><td>Split First Name</td><td><code>Jane Doe</code> &rarr; <code>Jane</code></td></tr>
      <tr><td>Split Last Name</td><td><code>Jane Doe</code> &rarr; <code>Doe</code></td></tr>
    </table>
  </li>
  <li>Save the workflow.</li>
</ol>
<p>When a record reaches this step, CleanMerge runs the transformation and returns the result as <strong>Normalized text</strong>, which later workflow actions (e.g. "Set property value") can use. If a value can't be transformed (e.g. an unparseable phone number), CleanMerge returns the original value with an error status rather than failing the workflow.</p>

<h2>Disconnect the app</h2>
<div class="callout"><strong>Note:</strong> Disconnecting CleanMerge stops the workflow action from running in any workflow that uses it. Property values CleanMerge already set are not changed or removed.</div>
<ol>
  <li>In HubSpot, go to <strong>Settings</strong> &rarr; <strong>Integrations</strong> &rarr; <strong>Connected Apps</strong>.</li>
  <li>Find CleanMerge in the list and click into it.</li>
  <li>Click <strong>Remove</strong>, then confirm.</li>
</ol>

<h2>Uninstall the app</h2>
<p>Removing a connected app in HubSpot (above) also uninstalls it. For general guidance on managing or removing connected apps, see HubSpot's <a href="https://knowledge.hubspot.com/integrations/manage-your-connected-apps" target="_blank" rel="noopener">Manage your connected apps</a> article.</p>

<footer>CleanMerge &middot; Questions? <a href="mailto:jgauthier@taskdropoff.com">jgauthier@taskdropoff.com</a> &middot; <a href="/docs/pricing">Pricing</a> &middot; <a href="/docs/privacy">Privacy Policy</a> &middot; <a href="/docs/terms">Terms of Service</a></footer>
</body>
</html>`;
}
