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

## Response behavior

Valid executions always return HTTP 200 with HubSpot output fields:

```json
{ "outputFields": { "outputText": "Jane Doe", "status": "SUCCESS" } }
```

Transformation failures also return HTTP 200 so the workflow receives deterministic outputs; `status` begins with `ERROR:` and `outputText` contains the original input.
