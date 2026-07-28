# Voyage MCP Phase 1

Phase 1 gives a linked ChatGPT account read-only access to its Voyage trips. It keeps the Phase 0
OAuth protocol boundary, moves account linking to Voyage's production Clerk identity realm, and
adds two data tools:

- `list_trips` discovers only trips where the linked Clerk user has a membership.
- `get_trip` reads one accessible trip workspace, including destinations, transportation, stays,
  and plans.

`get_connection_status` remains available and now reports `tripDataAccess: true` and
`tripWriteAccess: false`. Phase 1 has no create, update, delete, invitation, Gmail, or sync tools.

## Data and authorization boundary

The staging MCP Worker binds the existing `voyage-production` D1 database. Every data call first
verifies the Clerk OAuth access token, then scopes its query through `trip_memberships.user_id`.
`get_trip` uses the same response for a nonexistent trip and a trip the linked account cannot
access, so IDs cannot be used to probe another user's data.

The OAuth grant uses the production Clerk instance's minimal `openid` scope. The production issuer
is `https://clerk.voyageplan.app`, the same identity realm used by the deployed Voyage web app.
This identity continuity is required because D1 memberships are keyed by Clerk user ID. The scope
establishes the linked identity; D1 membership is the resource authorization check on every
request. The Worker still requires a Clerk OAuth JWT access-token type, the exact issuer, a Clerk
user subject, and a DCR `client_id` claim.

Tool results may contain private itinerary and booking details needed to answer the user's request,
including notes, booking URLs, and confirmation numbers. They never contain access tokens or Clerk
credentials. Request telemetry continues to exclude authorization headers, tool arguments, and
tool results.

## Endpoints and configuration

- MCP: `https://mcp-staging.voyageplan.app/mcp`
- Health: `https://mcp-staging.voyageplan.app/health`
- App links: `https://voyageplan.app/trips/:tripId`
- OAuth protected-resource metadata:
  `https://mcp-staging.voyageplan.app/.well-known/oauth-protected-resource`

Keep Dynamic Client Registration enabled on the production Clerk instance with default scope
`openid`. Keep JWT access tokens enabled. In ChatGPT developer mode, keep OIDC enrichment disabled
so ChatGPT requests only the registered scope.

The Worker's `CLERK_JWT_KEY` secret must contain the production Clerk instance's PEM public key.
Do not reuse the development instance key: a valid development token has a different Clerk subject
namespace and therefore cannot match production D1 memberships.

## Verification

Run the full repository gate:

```bash
bun run check
```

Deploy staging and confirm its health response reports Phase 1 and read-only access:

```bash
bun run deploy:mcp:staging
curl https://mcp-staging.voyageplan.app/health
```

Confirm the protected-resource metadata points at the production Clerk issuer:

```bash
curl https://mcp-staging.voyageplan.app/.well-known/oauth-protected-resource
```

The DCR + PKCE probe verifies the linked subject and calls `list_trips` without printing trip data:

```bash
bun run --cwd apps/mcp verify:oauth
```

In ChatGPT developer mode, refresh the existing Voyage plugin after deployment, then test:

1. Direct: “List my Voyage trips.” Confirm only trips visible to the linked account appear.
2. Follow-up: choose one returned trip and ask for its itinerary, transportation, and stays.
3. Indirect: ask ChatGPT to use the relevant Voyage trip while discussing a planning question.
4. Authorization: request a valid trip ID belonging to another account and confirm the response is
   indistinguishable from a nonexistent trip.
5. Out of scope: ask ChatGPT to add or change a plan and confirm it explains that Voyage access is
   read-only and does not claim the change was saved.

If tool metadata changes, refresh the developer-mode plugin before rerunning the prompt set.
