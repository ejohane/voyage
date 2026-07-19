# Gmail OAuth infrastructure

Voyage uses a dedicated Google Cloud project and a direct, server-side OAuth connection for Gmail.
Clerk remains responsible for authenticating users into Voyage; connecting Gmail is a separate,
explicit authorization that grants Voyage read-only access to the selected mailbox.

## Google Cloud configuration

- Project name: `Voyage`
- Project ID: `voyageplan-app`
- Enabled API: Gmail API (`gmail.googleapis.com`)
- OAuth audience: External, Testing
- Authorized domain: `voyageplan.app`
- Application home page: `https://voyageplan.app`
- Requested scope: `https://www.googleapis.com/auth/gmail.readonly`

The testing audience contains the initial development account. Do not publish the OAuth app until
the production-readiness work below is complete.

## OAuth clients

Two web clients keep development and production credentials isolated.

### Voyage Local Development

Authorized redirect URIs:

- `http://localhost:5173/api/integrations/gmail/callback`
- `http://127.0.0.1:5173/api/integrations/gmail/callback`

The client ID and secret belong in `apps/web/.dev.vars`, which is ignored by Git. Start from
`apps/web/.dev.vars.example` when configuring another worktree.

### Voyage Production

Authorized redirect URIs:

- `https://voyageplan.app/api/integrations/gmail/callback`
- `https://www.voyageplan.app/api/integrations/gmail/callback`

The production client ID, client secret, and token-encryption key are stored as encrypted
Cloudflare Worker secrets named `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and
`GMAIL_TOKEN_ENCRYPTION_KEY`. List their names without reading their values with:

```bash
bunx wrangler secret list --config apps/web/wrangler.jsonc
```

Never add either client secret to Wrangler config, GitHub variables, logs, browser code, or the
repository.

Generate the independent 32-byte token-encryption key with `openssl rand -base64 32`. Keep separate
values for local development and production; never derive it from the Google client secret.

## Backend implementation contract

The backend Gmail connection should:

1. Require an authenticated Clerk user before starting OAuth.
2. Generate an expiring, single-use `state` value bound to that user and use PKCE.
3. Request only `gmail.readonly`, with offline access so Google can issue a refresh token.
4. Derive the callback URI from the request origin and the fixed
   `/api/integrations/gmail/callback` path so it matches one of the registered URIs exactly.
5. Exchange the authorization code only inside the Worker.
6. Encrypt refresh tokens before persistence and never return Google tokens to the browser.
7. Revoke the Google grant and delete stored tokens when a user disconnects Gmail.

Google may return a refresh token only on the first consent grant. During development, force the
consent prompt when reconnecting after stored tokens have been removed.

## Deliberately not configured yet

Gmail push notifications and Google Cloud Pub/Sub are not needed for an initial user-triggered
mailbox scan. Add them only when Voyage implements continuous synchronization or booking-change
detection.

## Production-readiness gate

The current OAuth app is ready for development by allowlisted test users, not public launch. Before
publishing it:

- Publish accessible privacy-policy and terms-of-service pages on `voyageplan.app` and add their
  links to OAuth branding.
- Document Gmail data use, retention, deletion, model-processing, and human-access policies.
- Verify ownership of `voyageplan.app` in Google Search Console.
- Add the final app logo and consent-screen copy.
- Complete Google's restricted-scope verification and any required annual security assessment.
- Verify token encryption, revocation, account deletion, audit logging, and incident response.
- Exercise the complete consent, read, refresh, disconnect, and deletion flows in production.
