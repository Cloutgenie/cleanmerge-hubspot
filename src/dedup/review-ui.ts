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
<style>
  body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.25rem; }
  .controls { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
  .controls input { flex: 1; padding: 0.4rem; }
  .controls button { padding: 0.4rem 1rem; }
  .candidate { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .records { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 0.5rem 0; }
  .record { background: #f7f7f7; border-radius: 6px; padding: 0.5rem 0.75rem; font-size: 0.85rem; }
  .record div { margin: 0.15rem 0; }
  .meta { font-size: 0.8rem; color: #555; margin: 0.5rem 0; }
  .rationale { font-size: 0.85rem; background: #fff8e1; border-radius: 6px; padding: 0.5rem 0.75rem; margin: 0.5rem 0; }
  .actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
  .actions button { padding: 0.4rem 1rem; cursor: pointer; }
  .approve { background: #d1f7d6; border: 1px solid #4caf50; }
  .reject { background: #fbd7d7; border: 1px solid #e53935; }
  #empty { color: #777; }
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
        '<button class="approve">Approve (same entity)</button>' +
        '<button class="reject">Reject (different)</button>' +
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
