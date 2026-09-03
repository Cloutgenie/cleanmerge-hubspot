/**
 * Public pricing page, required for HubSpot Marketplace listing submission.
 * Reflects ToS section 4 (Fees) — free today, no paid tier exists in the app yet.
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
  .lede { color: var(--text-muted); font-size: 1.02rem; margin-bottom: 2rem; }
  .plan {
    background: var(--panel);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent-strong);
    border-radius: 10px;
    padding: 1.5rem 1.75rem;
    margin: 1.5rem 0;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  }
  .plan-name {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 500;
    font-size: 1.1rem;
    color: var(--accent);
  }
  .plan-price {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 300;
    font-size: 2.4rem;
    margin: 0.4rem 0 1rem;
  }
  .plan-price span { font-size: 1rem; color: var(--text-muted); font-family: "Karla", sans-serif; }
  .plan ul { padding-left: 1.2rem; margin: 0.75rem 0 0; }
  .plan li { margin: 0.4rem 0; }
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
  footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.85rem; }
</style>
</head>
<body>

<h1>Pricing</h1>
<p class="lede">CleanMerge is free to install and use today. There is no paid tier.</p>

<div class="plan">
  <div class="plan-name">Free</div>
  <div class="plan-price">$0 <span>/ forever, no card required</span></div>
  <ul>
    <li>Unlimited use of the <strong>CleanMerge: Normalize CRM Data</strong> workflow action, in any number of workflows.</li>
    <li>Proper Case, Uppercase, Lowercase, Extract Domain, Format Phone (E.164), Split First/Last Name transformations.</li>
    <li>No per-record or per-workflow-run charges.</li>
  </ul>
  <div><a class="install-btn" href="${installUrl}">Install CleanMerge</a></div>
</div>

<h2>What's not included yet</h2>
<p>CleanMerge also includes duplicate-detection and merge tooling (blocking, fuzzy matching, an AI judgment pass, and a human review queue). This is built and running today, but it's operated internally and isn't self-serve for installers yet &mdash; so it isn't part of the app you install, and it isn't priced. When it becomes available to installers, we'll announce it and update this page before any pricing applies to your account.</p>

<div class="callout">
<strong>No surprise charges:</strong> per our <a href="/docs/terms">Terms of Service</a>, if we introduce a paid plan in the future, we'll provide notice before any charges apply to your account.
</div>

<footer>CleanMerge &middot; Questions? <a href="mailto:jgauthier@taskdropoff.com">jgauthier@taskdropoff.com</a> &middot; <a href="/docs/privacy">Privacy Policy</a> &middot; <a href="/docs/terms">Terms of Service</a></footer>
</body>
</html>`;
}
