/**
 * Public Terms of Service, required for HubSpot Marketplace listing submission.
 */
export function renderTermsOfService(): string {
  const effectiveDate = "September 3, 2026";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CleanMerge Terms of Service</title>
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
  code {
    background: var(--panel-alt);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.88em;
  }
  a { color: var(--accent); }
  footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.85rem; }
</style>
</head>
<body>

<h1>Terms of Service</h1>
<p class="lede">CleanMerge &middot; Effective ${effectiveDate}</p>

<p>These Terms of Service ("Terms") govern your use of CleanMerge, a HubSpot integration ("Service"). By installing or using CleanMerge, you agree to these Terms. If you do not agree, do not install or use the Service.</p>

<h2>1. The Service</h2>
<p>CleanMerge is a HubSpot app that adds a custom workflow action for normalizing CRM field values (e.g. name casing, phone formatting, domain extraction). CleanMerge also operates internal duplicate-detection tooling used by its developer to identify and, on request, merge duplicate Contact and Company records; this tooling is not currently self-serve for installers. See our <a href="/docs/shared-data">Shared Data documentation</a> for details on what data each part of the Service accesses.</p>

<h2>2. Eligibility</h2>
<p>You must have a valid HubSpot account with permission to install third-party apps to use CleanMerge. You are responsible for ensuring your use of CleanMerge complies with your own organization's policies and your agreement with HubSpot.</p>

<h2>3. Acceptable use</h2>
<p>You agree not to:</p>
<ul>
  <li>Reverse engineer, decompile, or attempt to extract the source code of the Service, except where applicable law permits it.</li>
  <li>Use the Service to process data you do not have the right to process.</li>
  <li>Interfere with or disrupt the integrity or performance of the Service.</li>
  <li>Use the Service for any unlawful purpose.</li>
</ul>

<h2>4. Fees</h2>
<p>The CleanMerge workflow action described in our <a href="/docs/setup">setup guide</a> is provided free of charge, with no automatic billing. Warehouse Sync (see <a href="/docs/pricing">Pricing</a>) is a separately-scoped, quote-based service arranged directly with you before any setup begins — it is never billed automatically through the app, and no charge applies until pricing has been confirmed with you in writing.</p>

<h2>5. Data</h2>
<p>Our collection and use of data through the Service is described in our <a href="/docs/privacy">Privacy Policy</a>, which is incorporated into these Terms by reference.</p>

<h2>6. Disclaimer of warranties</h2>
<p>The Service is provided "as is" and "as available," without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or that any transformation or duplicate-detection result will be accurate; you are responsible for reviewing changes made to your CRM data.</p>

<h2>7. Limitation of liability</h2>
<p>To the maximum extent permitted by law, CleanMerge and its developer will not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, revenue, or profits, arising from your use of the Service.</p>

<h2>8. Termination</h2>
<p>You may stop using CleanMerge at any time by removing it from your HubSpot account's connected apps. We may suspend or terminate access to the Service if we reasonably believe these Terms have been violated.</p>

<h2>9. Changes to these Terms</h2>
<p>We may update these Terms from time to time. If we make material changes, we will update the effective date above. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.</p>

<h2>10. Governing law</h2>
<p>These Terms are governed by the laws of the United States, without regard to conflict-of-law principles.</p>

<h2>11. Contact</h2>
<p>Questions about these Terms can be sent to <a href="mailto:jgauthier@taskdropoff.com">jgauthier@taskdropoff.com</a>.</p>

<footer>CleanMerge &middot; <a href="/docs/pricing">Pricing</a> &middot; <a href="/docs/privacy">Privacy Policy</a></footer>
</body>
</html>`;
}
