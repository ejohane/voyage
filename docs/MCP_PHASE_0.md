# Voyage MCP Phase 0

Phase 0 proves the public MCP transport and Clerk OAuth boundary without granting the Worker access
to Voyage trip data. The staging server exposes one diagnostic tool,
`get_connection_status`, which returns the linked Clerk subject and an explicit
`tripDataAccess: false` marker.

## Endpoints

- MCP: `https://mcp-staging.voyageplan.app/mcp`
- OAuth protected-resource metadata:
  `https://mcp-staging.voyageplan.app/.well-known/oauth-protected-resource`
- Health: `https://mcp-staging.voyageplan.app/health`
- Clerk authorization server: `https://special-bullfrog-79.clerk.accounts.dev`

The future public origin remains `https://mcp.voyageplan.app/mcp`. Do not publish a Voyage plugin
against the staging origin.

## Clerk development-instance settings

In Clerk Dashboard → OAuth applications:

1. Enable Dynamic client registration.
2. Set Default scopes to `openid` only.
3. Require the OAuth consent screen.
4. Generate OAuth access tokens as JWTs.

Dynamic registration is intentionally enabled only on the development Clerk instance during Phase
0. It exposes a public client-registration endpoint and must be monitored and reviewed before any
production rollout.

## Local configuration

Copy the example file and supply the development Clerk instance values without committing them:

```bash
cp apps/mcp/.dev.vars.example apps/mcp/.dev.vars
bun run dev:mcp
```

The Worker requires only Clerk's public `CLERK_JWT_KEY`; no Clerk secret key is present. It accepts
only Clerk OAuth JWT access-token types and requires the `openid` scope. Clerk's verifier checks the
JWT type, algorithm, signature, subject, expiry, activation, and issue time. Voyage then requires the
exact development-instance issuer, a Clerk user subject, and the DCR `client_id` claim.

Clerk's dynamically registered OAuth access tokens currently carry a `client_id` claim but no
`aud` claim, and ignore the OAuth `resource` parameter. Accordingly, do not pass an `audience`
option to Clerk's verifier: it would reject every valid ChatGPT-style DCR token. The Phase 0 server
still publishes RFC 9728 resource metadata, and the verification probe sends the `resource`
parameter through the authorization and token requests. Before any trip read/write tools ship,
revisit this boundary alongside scopes and trip membership; Phase 0 deliberately exposes identity
only.

## Deployment

Verify Cloudflare authentication before deploying:

```bash
bunx wrangler whoami
bun run deploy:mcp:staging
```

Set the Clerk JWT public key as the `CLERK_JWT_KEY` Cloudflare Worker secret rather than committing
it to `wrangler.jsonc`.

## Verification

Run the repository gate first:

```bash
bun run check
```

Then inspect the public server:

```bash
npx @modelcontextprotocol/inspector@latest
```

Connect the Inspector to `https://mcp-staging.voyageplan.app/mcp`, complete the Clerk consent flow,
and call `get_connection_status`. A valid Phase 0 result contains the expected Clerk subject,
`environment: "staging"`, and `tripDataAccess: false`.

The repo also includes a DCR + PKCE verifier that opens a temporary localhost callback and prints
an authorization URL without printing tokens:

```bash
bun run --cwd apps/mcp verify:oauth
```

Also verify that calling the tool before linking returns an MCP error with
`_meta["mcp/www_authenticate"]`, and that the linked Worker has no D1 binding.
