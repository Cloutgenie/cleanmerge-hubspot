/**
 * Root landing page — the actual front door now that cleanmerge.jaduno.com exists as a proper
 * domain rather than just an API host. Same design system as the /docs/* pages (dark theme, Karla +
 * Space Grotesk) but wider and hero-led, since this is the first thing a visitor sees, not a doc.
 */
export function renderLanding(installUrl: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CleanMerge for HubSpot</title>
<meta name="description" content="We handle CRM dedup for you — no data team required. Free workflow action to normalize CRM data, plus managed Warehouse Sync with built-in duplicate detection.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Karla:wght@400;500;600&family=Space+Grotesk:wght@300;500;600&display=swap" rel="stylesheet">
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
    --good: #6fd3a1;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Karla", -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    margin: 0;
    line-height: 1.6;
  }
  .wrap { max-width: 1040px; margin: 0 auto; padding: 0 1.5rem; }
  header.top {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1.5rem 0;
  }
  .logo { font-family: "Space Grotesk", -apple-system, sans-serif; font-weight: 600; font-size: 1.1rem; }
  .top-links a { color: var(--text-muted); text-decoration: none; font-size: 0.92rem; margin-left: 1.75rem; }
  .top-links a:hover { color: var(--text); }
  .hero { padding: 4rem 0 3rem; }
  .eyebrow {
    display: inline-block;
    color: var(--good);
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-size: 0.78rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 1rem;
  }
  h1 {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 300;
    font-size: 2.9rem;
    line-height: 1.15;
    margin: 0 0 1.25rem;
    max-width: 760px;
  }
  h1 strong { font-weight: 600; color: var(--accent); }
  .hero-sub { color: var(--text-muted); font-size: 1.15rem; max-width: 620px; margin: 0 0 2rem; }
  .cta-row { display: flex; gap: 1rem; flex-wrap: wrap; }
  .btn {
    display: inline-block;
    padding: 0.85rem 1.7rem;
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 500;
    text-decoration: none;
    border-radius: 999px;
    font-size: 0.98rem;
  }
  .btn-primary { background: var(--accent); color: #03090e; }
  .btn-primary:hover { background: var(--accent-strong); }
  .btn-secondary { background: transparent; color: var(--text); border: 1px solid var(--border); }
  .btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
  section { padding: 2.5rem 0; }
  section.divider { border-top: 1px solid var(--border); }
  h2 {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 500;
    font-size: 1.5rem;
    margin: 0 0 0.5rem;
  }
  .section-sub { color: var(--text-muted); margin: 0 0 2rem; max-width: 620px; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; }
  @media (max-width: 760px) { .grid3 { grid-template-columns: 1fr; } .hero h1 { font-size: 2.2rem; } }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.5rem;
  }
  .card h3 {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 500;
    font-size: 1.05rem;
    margin: 0 0 0.6rem;
    color: var(--accent);
  }
  .card p { color: var(--text-muted); font-size: 0.92rem; margin: 0; }
  .transform-table { width: 100%; border-collapse: collapse; margin: 0; font-size: 0.9rem; }
  .transform-table th, .transform-table td { text-align: left; padding: 0.55rem 0.9rem; border-bottom: 1px solid var(--border); }
  .transform-table th { color: var(--text-muted); font-weight: 500; }
  code {
    background: var(--panel-alt);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.88em;
  }
  .pricing-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
  @media (max-width: 760px) { .pricing-row { grid-template-columns: 1fr; } }
  .plan { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 1.5rem 1.75rem; }
  .plan.featured { border-left: 3px solid var(--good); }
  .plan-name { font-family: "Space Grotesk", -apple-system, sans-serif; font-weight: 500; font-size: 1.05rem; }
  .plan-price { font-family: "Space Grotesk", -apple-system, sans-serif; font-weight: 300; font-size: 1.7rem; margin: 0.3rem 0 0.75rem; }
  .plan-price span { font-size: 0.85rem; color: var(--text-muted); font-family: "Karla", sans-serif; }
  a.textlink { color: var(--accent); }
  footer {
    border-top: 1px solid var(--border);
    padding: 2rem 0 3rem;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  footer a { color: var(--text-muted); margin-right: 1.25rem; text-decoration: none; }
  footer a:hover { color: var(--accent); }
</style>
</head>
<body>

<div class="wrap">
  <header class="top">
    <div class="logo">CleanMerge</div>
    <nav class="top-links">
      <a href="/docs/how-to-use">How to Use</a>
      <a href="/docs/pricing">Pricing</a>
    </nav>
  </header>

  <div class="hero">
    <div class="eyebrow">For HubSpot</div>
    <h1>We handle <strong>CRM dedup</strong> for you &mdash; no data team required.</h1>
    <p class="hero-sub">Start free with a workflow action that cleans up messy names, phone numbers, and URLs directly inside HubSpot. Move to Warehouse Sync when you need your warehouse and HubSpot to stay in step without creating duplicates.</p>
    <div class="cta-row">
      <a class="btn btn-primary" href="${installUrl}">Install CleanMerge</a>
      <a class="btn btn-secondary" href="/docs/how-to-use">See how it works</a>
    </div>
  </div>
</div>

<section class="divider">
  <div class="wrap">
    <h2>What CleanMerge does</h2>
    <p class="section-sub">Two products, one job: keep HubSpot data clean without hiring for it.</p>
    <div class="grid3">
      <div class="card">
        <h3>Free workflow action</h3>
        <p>Add <strong style="color:var(--text)">Normalize CRM Data</strong> to any workflow. Proper-case names, extract clean domains, format phone numbers to E.164 &mdash; up to 50 runs/month, no card required.</p>
      </div>
      <div class="card">
        <h3>AI-assisted dedup</h3>
        <p>Warehouse Sync checks every incoming row against your existing HubSpot records with fuzzy + AI matching before anything is written &mdash; confident matches update, ambiguous ones queue for a quick human review.</p>
      </div>
      <div class="card">
        <h3>Nothing stored</h3>
        <p>The free action is a pass-through: HubSpot sends a value, CleanMerge transforms it, HubSpot writes it back. No CRM read/write access needed, no copy of your data held anywhere.</p>
      </div>
    </div>
  </div>
</section>

<section class="divider">
  <div class="wrap">
    <h2>Transformations</h2>
    <p class="section-sub">Available today in the free workflow action.</p>
    <table class="transform-table">
      <tr><th>Transformation</th><th>Example</th></tr>
      <tr><td>Proper Case</td><td><code>JANE DOE</code> &rarr; <code>Jane Doe</code></td></tr>
      <tr><td>Uppercase / Lowercase</td><td><code>jane doe</code> &harr; <code>JANE DOE</code></td></tr>
      <tr><td>Extract Domain</td><td><code>https://www.acme.com/about</code> &rarr; <code>acme.com</code></td></tr>
      <tr><td>Format Phone (E.164)</td><td><code>(312) 555-0199</code> &rarr; <code>+13125550199</code></td></tr>
      <tr><td>Split First / Last Name</td><td><code>Jane Doe</code> &rarr; <code>Jane</code> / <code>Doe</code></td></tr>
    </table>
  </div>
</section>

<section class="divider">
  <div class="wrap">
    <h2>Pricing</h2>
    <p class="section-sub">See the <a class="textlink" href="/docs/pricing">full pricing page</a> for details and how this compares to general-purpose reverse-ETL tools.</p>
    <div class="pricing-row">
      <div class="plan">
        <div class="plan-name">Free</div>
        <div class="plan-price">$0 <span>/ forever</span></div>
        <p style="color:var(--text-muted); font-size:0.92rem; margin:0;">Up to 50 runs/month of the Normalize CRM Data action, across any number of workflows.</p>
      </div>
      <div class="plan featured">
        <div class="plan-name">Warehouse Sync</div>
        <div class="plan-price">From $299 <span>/ mo, per connection</span></div>
        <p style="color:var(--text-muted); font-size:0.92rem; margin:0;">Managed sync from your warehouse into HubSpot with duplicate protection built in.</p>
      </div>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <div style="margin-bottom:0.75rem;">
      <a href="/docs/how-to-use">How to Use</a>
      <a href="/docs/setup">Setup Guide</a>
      <a href="/docs/pricing">Pricing</a>
      <a href="/docs/privacy">Privacy Policy</a>
      <a href="/docs/terms">Terms of Service</a>
    </div>
    CleanMerge &middot; Questions? <a href="mailto:jay@kinetify.com" style="margin:0;">jay@kinetify.com</a>
  </div>
</footer>
</body>
</html>`;
}
