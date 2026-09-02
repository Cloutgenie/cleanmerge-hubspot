/**
 * A minimal server-rendered review queue: no build step, no framework. The page shell carries
 * no data — it prompts for the admin token client-side and uses it as a Bearer credential for
 * the actual data-fetching calls, so nothing is exposed without the token.
 *
 * The script is served from a separate same-origin route (not inlined) because the app's default
 * Content Security Policy (script-src 'self'; script-src-attr 'none') blocks both inline <script>
 * blocks and inline onclick="" attributes.
 */
export function renderReviewPage(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>CleanMerge Review Queue</title>
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
    --text-muted: rgba(255, 255, 255, 0.6);
    --accent: #89bef3;
    --accent-strong: #5fa7e7;
    --approve: #6fd3a1;
    --reject: #f38b8b;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Karla", -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    max-width: 900px;
    margin: 2rem auto;
    padding: 0 1.5rem 3rem;
  }
  h1 {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 300;
    font-size: 1.75rem;
    letter-spacing: 0.01em;
    margin-bottom: 1.5rem;
  }
  .controls { display: flex; gap: 0.5rem; margin-bottom: 2rem; }
  .controls input {
    flex: 1;
    padding: 0.55rem 0.75rem;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-family: inherit;
    font-size: 0.9rem;
  }
  .controls input::placeholder { color: var(--text-muted); }
  .controls input:focus { outline: none; border-color: var(--accent); }
  .controls button, .actions button {
    font-family: "Space Grotesk", -apple-system, sans-serif;
    font-weight: 500;
    cursor: pointer;
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  .controls button {
    padding: 0.55rem 1.25rem;
    background: var(--accent);
    color: #03090e;
    border: none;
  }
  .controls button:hover { background: var(--accent-strong); }
  .candidate {
    background: var(--panel);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent-strong);
    border-radius: 10px;
    padding: 1.25rem;
    margin-bottom: 1rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  }
  .records { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin: 0.75rem 0; }
  .record {
    background: var(--panel-alt);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.6rem 0.85rem;
    font-size: 0.85rem;
  }
  .meta { font-size: 0.8rem; color: var(--text-muted); margin: 0.5rem 0; }
  .rationale {
    font-size: 0.85rem;
    background: rgba(137, 190, 243, 0.1);
    border: 1px solid rgba(137, 190, 243, 0.25);
    border-radius: 6px;
    padding: 0.6rem 0.85rem;
    margin: 0.75rem 0;
    line-height: 1.4;
  }
  .rationale strong { color: var(--accent); }
  .actions { display: flex; gap: 0.6rem; margin-top: 1rem; padding-top: 0.9rem; border-top: 1px solid var(--border); }
  .actions button {
    padding: 0.55rem 1.3rem;
    font-size: 0.85rem;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    transition: transform 0.12s ease, box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease;
  }
  .actions button:active { transform: scale(0.96); }
  .approve {
    background: var(--approve);
    color: #04180e;
    border: none;
    font-weight: 600;
  }
  .approve:hover { background: #86e0b6; box-shadow: 0 0 0 4px rgba(111, 211, 161, 0.18); }
  .reject {
    background: transparent;
    color: var(--reject);
    border-color: rgba(243, 139, 139, 0.35) !important;
  }
  .reject:hover { background: rgba(243, 139, 139, 0.1); border-color: var(--reject) !important; }
  #empty { color: var(--text-muted); }
</style>
</head>
<body>
<h1>CleanMerge Review Queue</h1>
<div class="controls">
  <input id="portalId" type="text" placeholder="Portal ID">
  <input id="token" type="password" placeholder="Admin token">
  <button id="loadBtn">Load</button>
</div>
<div id="list"></div>
<p id="empty" style="display:none">No pending ambiguous candidates.</p>
<script src="/internal/dedup/review-ui.js"></script>
</body>
</html>`;
}

export function renderReviewScript(): string {
  return `function creds() {
  const token = document.getElementById("token").value || sessionStorage.getItem("cm_token") || "";
  const portalId = document.getElementById("portalId").value || sessionStorage.getItem("cm_portal") || "";
  if (token) sessionStorage.setItem("cm_token", token);
  if (portalId) sessionStorage.setItem("cm_portal", portalId);
  return { token, portalId };
}

function label(objectType, props) {
  if (!props) return "(record data unavailable)";
  if (objectType === "COMPANY") return (props.name || "(no name)") + " <" + (props.domain || "no domain") + ">";
  return (props.firstname || "") + " " + (props.lastname || "") + " <" + (props.email || "no email") + ">";
}

async function load() {
  const { token, portalId } = creds();
  const res = await fetch("/internal/dedup/review-candidates?portalId=" + encodeURIComponent(portalId), {
    headers: { Authorization: "Bearer " + token },
  });
  if (!res.ok) { alert("Failed to load (" + res.status + ")"); return; }
  const { candidates } = await res.json();
  const list = document.getElementById("list");
  list.innerHTML = "";
  document.getElementById("empty").style.display = candidates.length === 0 ? "block" : "none";
  for (const c of candidates) {
    const el = document.createElement("div");
    el.className = "candidate";
    el.innerHTML =
      '<div class="meta">' + c.objectType + ' &middot; score ' + c.score.toFixed(2) + '</div>' +
      '<div class="records">' +
        '<div class="record">' + label(c.objectType, c.propertiesA) + '</div>' +
        '<div class="record">' + label(c.objectType, c.propertiesB) + '</div>' +
      '</div>' +
      (c.aiRationale
        ? '<div class="rationale"><strong>AI verdict:</strong> ' + (c.aiSameEntity ? "likely same" : "likely different") +
          ' (confidence ' + (c.aiConfidence ?? 0).toFixed(2) + ')<br>' + c.aiRationale + '</div>'
        : '<div class="meta">No AI verdict recorded.</div>') +
      '<div class="actions">' +
        '<button class="approve">&#10003; Approve</button>' +
        '<button class="reject">&#10005; Reject</button>' +
      '</div>';
    el.querySelector(".approve").addEventListener("click", () => decide(c, "approved", el));
    el.querySelector(".reject").addEventListener("click", () => decide(c, "rejected", el));
    list.appendChild(el);
  }
}

async function decide(c, decision, el) {
  const { token, portalId } = creds();
  const res = await fetch("/internal/dedup/review-decide", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ portalId, objectType: c.objectType, recordAId: c.recordAId, recordBId: c.recordBId, decision }),
  });
  if (!res.ok) { alert("Failed to record decision (" + res.status + ")"); return; }
  el.remove();
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("token").value = sessionStorage.getItem("cm_token") || "";
  document.getElementById("portalId").value = sessionStorage.getItem("cm_portal") || "";
  document.getElementById("loadBtn").addEventListener("click", load);
});
`;
}
