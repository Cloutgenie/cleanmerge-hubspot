/**
 * Post-install confirmation page. This used to be a bare "You may close this window" dead end —
 * the single leakiest point in activation: 7 of the first 8 installers never ran the action once.
 * The fix isn't more docs, it's putting the next step directly in front of the person while
 * they're still looking at the screen, instead of trusting them to go find /docs/how-to-use later.
 */
export function renderInstallSuccess(workflowsUrl: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CleanMerge is connected</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Karla:wght@400;500;600&family=Space+Grotesk:wght@300;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #03090e;
    --panel: #020e24;
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
    max-width: 640px;
    margin: 0 auto;
    padding: 3.5rem 1.5rem 5rem;
    line-height: 1.6;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(111, 211, 161, 0.12);
    border: 1px solid rgba(111, 211, 161, 0.35);
    color: #6fd3a1;
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-size: 0.8rem;
    font-weight: 500;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    margin-bottom: 1rem;
  }
  h1 {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 300;
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }
  .lede { color: var(--text-muted); font-size: 1.02rem; margin-bottom: 2rem; }
  .next-steps {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.5rem 1.75rem;
    margin: 1.5rem 0;
  }
  .next-steps h2 {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 500;
    font-size: 1.05rem;
    margin: 0 0 1rem;
  }
  ol { padding-left: 1.2rem; margin: 0; }
  li { margin: 0.6rem 0; }
  code {
    background: #010b15;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.9em;
  }
  .cta-btn {
    display: inline-block;
    margin-top: 0.5rem;
    padding: 0.75rem 1.6rem;
    background: var(--accent);
    color: #03090e;
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 500;
    text-decoration: none;
    border-radius: 999px;
  }
  .cta-btn:hover { background: var(--accent-strong); }
  a { color: var(--accent); }
  footer { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.85rem; }
</style>
</head>
<body>

<div class="badge">&#10003; Connected</div>
<h1>CleanMerge is connected.</h1>
<p class="lede">One more step and it'll actually start cleaning up your data — installing alone doesn't do anything until it's added to a workflow.</p>

<div class="next-steps">
  <h2>Add it to a workflow now</h2>
  <ol>
    <li>Click the button below to jump straight into your HubSpot workflows.</li>
    <li>Open (or create) a workflow, click <strong>+</strong>, and search for <strong>CleanMerge</strong>.</li>
    <li>Add <strong>CleanMerge: Normalize CRM Data</strong>, then add a <strong>Set property value</strong> step right after it &mdash; that second step is what actually writes the cleaned-up value to the record.</li>
  </ol>
  <div><a class="cta-btn" href="${workflowsUrl}" target="_blank" rel="noopener">Go to your Workflows &rarr;</a></div>
</div>

<p>Prefer the full walkthrough first? See <a href="/docs/how-to-use">How to Use CleanMerge</a> &mdash; it covers every transformation and the setup step above in detail.</p>

<footer>You can close this tab once you're done, or come back to it any time from your HubSpot account's Connected Apps.</footer>
</body>
</html>`;
}
