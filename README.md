# CleanMerge HubSpot Workflow Action

Production-oriented Express/TypeScript service for normalizing CRM values from a HubSpot custom workflow action.

## Local setup

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Set the HubSpot app auth values and use an HTTPS tunnel for local testing. HubSpot's OAuth redirect URI must exactly match `HUBSPOT_REDIRECT_URI`. Visit `/oauth/install` to connect a portal.

## Register the action

Update your public URL in `.env`, then run:

```bash
pnpm register:action
```

The registration payload is in `action-definition.json`. New HubSpot developer projects can instead adapt the same `config` into a `workflow-action` component. The included script targets the legacy app registration endpoint because it remains the direct registration route for classic public apps.

## Security and deployment

- Workflow executions require a valid HubSpot v3 signature and a timestamp within five minutes.
- Raw request bytes are retained for signature verification; the request body is capped at 256 KB.
- OAuth state is HMAC-signed and expires after ten minutes.
- OAuth tokens are AES-256-GCM encrypted before being stored in Postgres.
- `OAuthTokenManager` refreshes access tokens automatically before expiry for future HubSpot API calls.
- `DATABASE_URL` and `TOKEN_ENCRYPTION_KEY` are mandatory when `NODE_ENV=production`.
- The in-memory token store is development/test only.

For Railway, deploy this package directory and add a Postgres service. For Vercel, set the project root to this directory and use a hosted Postgres connection string. Set `PUBLIC_BASE_URL` to the final HTTPS origin before registration.

## Warehouse ingest (internal, ops-configured)

Pulls rows from a customer's SQL-queryable warehouse (Databricks SQL Warehouses via REST today; anything exposing a similar statement-execution API fits the same `WarehouseConnector` interface) into HubSpot Contacts/Companies, matching incoming rows against existing records via the same blocking/scoring logic the dedup engine uses so ingest doesn't create fresh duplicates. Not installer-facing — configured per customer via the admin-gated `/internal/ingest/*` endpoints (require `Authorization: Bearer $INTERNAL_ADMIN_TOKEN`, same as `/internal/dedup/*`):

- `POST /internal/ingest/connections` — register a warehouse connection (`portalId`, `name`, `connectorType`, `config`, `credentials`). Credentials are AES-256-GCM encrypted at rest and never returned by any `GET`.
- `PUT /internal/ingest/connections/:id` — rotate credentials or update config.
- `DELETE /internal/ingest/connections/:id` — remove a connection, its mappings, and its run history (`portalId` required in the body, to confirm ownership).
- `GET /internal/ingest/connections?portalId=` — list connections for a portal.
- `POST /internal/ingest/mappings` — define the fixed source query, field mappings, and match-key columns for one object type on a connection.
- `POST /internal/ingest/run` — trigger a run (`portalId`, `connectionId`); returns per-object-type counts of rows created/updated/queued-for-review/errored.
- `GET /internal/ingest/runs?portalId=` — run history.

High-confidence matches update the existing record automatically; ambiguous matches are queued into the same review UI as the dedup engine (`/internal/dedup/review-ui`) — approving one there updates the matched record, rejecting one creates a new record instead. Both outcomes execute via `POST /internal/dedup/execute-merges`, alongside dedup merges. To undo a bad create (e.g. a wrong mapping), `DELETE /internal/dedup/objects/:objectType/:id` (`companies` | `contacts`, `portalId` in the body) archives the record.

Cadence is not self-service in this version: for each customer, deploy a second Railway service from this repo with `startCommand: npm run ingest:scheduled` and a `cronSchedule`, with env vars `INGEST_TARGET_BASE_URL` (or reuse `SCAN_TARGET_BASE_URL`), `INTERNAL_ADMIN_TOKEN`, `INGEST_PORTAL_ID`, `INGEST_CONNECTION_ID` — mirrors how `scan:scheduled` is deployed today.

Requires the same write scopes as the merge executor (`crm.objects.contacts.write`, `crm.objects.companies.write`) plus `crm.schemas.contacts.write` / `crm.schemas.companies.write` for mappings that create a custom property on first write.

## Contact Gate (internal, ops-configured) — reverse quarantine for Conversations-created contacts

HubSpot auto-creates a Contact for every unknown inbound Conversations/Help Desk email sender, with no native way to stop it — there's no pre-create intercept, only a webhook fired after the fact. Contact Gate listens for `contact.creation`, checks the new contact's `hs_object_source_label` to see if it came from Conversations, and — if the portal's policy says to — archives it within seconds and holds it in a review queue instead of leaving it in the CRM.

**Two platform facts had to be verified empirically before this shipped any live deletes, not assumed:**
- The webhooks component (`cleanmerge-hubspot-app/src/app/webhooks/webhooks-hsmeta.json`, scaffolded via `hs project add --features webhooks`) only supports `objectType: "contact"` for `object.creation` subscriptions — `"conversation"` was tried and rejected by a real `hs project upload`. Source detection therefore relies entirely on the created contact's own `hs_object_source_label`, not a separate Conversations-thread event.
- What happens to a Conversations thread after its contact is deleted seconds later is undocumented anywhere in HubSpot's docs. Because of that, **every portal defaults to `dry_run: true`** — the quarantine loop runs end-to-end (detects, logs, lets you promote/discard) without ever calling `archiveObject`, until `dry_run` is explicitly flipped off per portal after confirming real behavior in a sandbox.

Admin-gated endpoints (`Authorization: Bearer $INTERNAL_ADMIN_TOKEN`, same pattern as `/internal/dedup/*` and `/internal/ingest/*`):

- `PUT /internal/contact-gate/policy` — set `policy` (`never_create` | `allowlist_only` | `quarantine` | `create`) and `dryRun` (the kill switch) per portal.
- `GET /internal/contact-gate/policy?portalId=`
- `GET /internal/contact-gate/quarantine?portalId=` — pending queue.
- `POST /internal/contact-gate/quarantine/:id/promote` — recreates the contact (only if it was actually deleted) and optionally allowlists its domain (`addToAllowlist: true`).
- `POST /internal/contact-gate/quarantine/:id/discard` — suppresses the email for `suppressDays` (default 30) so it's re-quarantined, not re-reviewed from scratch, if it comes back.
- `POST /internal/contact-gate/allowlist` — add a `domain` or `email` match.
- `POST /internal/contact-gate/seed-allowlist` — bulk-seeds the allowlist from existing Company domains plus HubSpot Owner emails (the spec's "staff pack").
- `GET /internal/contact-gate/audit?portalId=` — every promote/discard/allowlist/policy-change, logged.

Requires the `conversations.read` and `crm.objects.owners.read` scopes, both added as `optionalScopes` in `app-hsmeta.json` (not `requiredScopes`) — ordinary free-tier installers aren't forced through a bigger consent screen for a feature they're not using. Set `HUBSPOT_OPTIONAL_SCOPES` (space/comma-separated) before walking a specific Contact Gate customer through `/oauth/install` so their reauthorization actually requests them.

## Response behavior

Valid executions always return HTTP 200 with HubSpot output fields:

```json
{ "outputFields": { "outputText": "Jane Doe", "status": "SUCCESS" } }
```

Transformation failures also return HTTP 200 so the workflow receives deterministic outputs; `status` begins with `ERROR:` and `outputText` contains the original input.
