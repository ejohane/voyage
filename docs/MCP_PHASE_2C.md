# Voyage MCP Phase 2C

Phase 2C makes Voyage's production OAuth flow work with ChatGPT's default OIDC enrichment while
preserving the existing least-privilege authorization boundary.

## Scope contract

The production Clerk instance must keep Dynamic Client Registration enabled and use these default
scopes:

- `openid` establishes the Clerk subject used by Voyage;
- `profile` supports ChatGPT's standard OIDC identity enrichment;
- `email` supports ChatGPT's standard OIDC identity enrichment.

Do not grant `public_metadata` or `private_metadata`. Voyage does not need either metadata surface.
Clerk automatically adds `offline_access` to dynamically registered public clients, so it does not
appear in the configured default-scope list.

Configure the production Clerk instance in **OAuth applications → Dynamic client registration →
Default scopes**, or use Clerk's authenticated CLI:

```sh
npx clerk@latest api instance/oauth_application_settings \
  -X PATCH \
  -d '{"default_scopes":["openid","profile","email"]}'
```

The MCP protected-resource metadata and every tool continue to require only `openid`. The Worker
uses the immutable Clerk `sub` claim as the user ID and D1 trip membership as the resource
authorization check. It accepts additional token scopes but does not store, log, or use the email or
profile claims for access decisions.

## Verification

Run the full repository gate:

```sh
bun run check
```

The OAuth verifier intentionally omits `scope` during Dynamic Client Registration, then requests
`openid profile email offline_access` during authorization. This proves Clerk applied the configured
defaults and its automatic refresh-token scope. It also verifies the user-info subject and presence
of the email claim without printing the email.

```sh
MCP_RESOURCE_URL=https://mcp-staging.voyageplan.app bun run --cwd apps/mcp verify:oauth
MCP_RESOURCE_URL=https://mcp.voyageplan.app bun run --cwd apps/mcp verify:oauth
```

For the ChatGPT smoke test, create a fresh production developer plugin with OAuth, Dynamic Client
Registration, and OIDC enrichment left at their discovered defaults. The connection must complete
without disabling OIDC or editing scopes manually. Run a read-only trip-list request and confirm the
new plugin appears as the response source and reports that no changes were made. The automated
verifier covers the connection boundary plus both write previews without committing a mutation.

## Privacy boundary

Phase 2C does not add Gmail access, email search, invitation behavior, or email-based authorization.
It only makes the standard OIDC identity grant compatible with ChatGPT. Gmail import and other
email capabilities remain separate, explicitly approved features.
