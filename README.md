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

High-confidence matches update the existing record automatically; ambiguous matches are queued into the same review UI as the dedup engine (`/internal/dedup/review-ui`) — approving one there updates the matched record, rejecting one creates a new record instead. Both outcomes execute via `POST /internal/dedup/execute-merges`, alongside dedup merges.

Cadence is not self-service in this version: for each customer, deploy a second Railway service from this repo with `startCommand: npm run ingest:scheduled` and a `cronSchedule`, with env vars `INGEST_TARGET_BASE_URL` (or reuse `SCAN_TARGET_BASE_URL`), `INTERNAL_ADMIN_TOKEN`, `INGEST_PORTAL_ID`, `INGEST_CONNECTION_ID` — mirrors how `scan:scheduled` is deployed today.

Requires the same write scopes as the merge executor (`crm.objects.contacts.write`, `crm.objects.companies.write`) plus `crm.schemas.contacts.write` / `crm.schemas.companies.write` for mappings that create a custom property on first write.

## Response behavior

Valid executions always return HTTP 200 with HubSpot output fields:

```json
{ "outputFields": { "outputText": "Jane Doe", "status": "SUCCESS" } }
```

Transformation failures also return HTTP 200 so the workflow receives deterministic outputs; `status` begins with `ERROR:` and `outputText` contains the original input.
