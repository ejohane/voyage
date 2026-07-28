# Voyage MCP Phase 2A

Phase 2A adds the first Voyage write path: an authenticated ChatGPT user can preview and
explicitly confirm a new private trip, including its ordered destinations and dates.

## Environments

The environments are intentionally isolated:

| Environment | MCP origin | D1 database | Voyage links |
| --- | --- | --- | --- |
| Staging | `https://mcp-staging.voyageplan.app` | `voyage-staging` | `https://voyageplan.app` |
| Production | `https://mcp.voyageplan.app` | `voyage-production` | `https://voyageplan.app` |

Both MCP Workers use the production Voyage Clerk issuer so the connected account subject matches
Voyage membership IDs. Staging never reads or writes the production D1 database.

## Tool flow

1. ChatGPT gathers a trip name plus 1–20 ordered destinations. Each destination may have an
   arrival and departure date.
2. `preview_trip` validates and normalizes the proposal without writing anything. It returns the
   exact proposal and a signed confirmation token that expires after 30 minutes.
3. ChatGPT shows that proposal to the user and asks for explicit confirmation.
4. After confirmation, ChatGPT calls `create_trip` with unchanged trip fields, the confirmation
   token, and a new UUID idempotency key.
5. Voyage atomically creates the trip, owner membership, destinations, and successful mutation
   audit record. The response includes the trip URL.

`create_trip` is annotated as a non-destructive, private, idempotent write. A retry with the same
user, tool, idempotency key, and proposal returns the original trip. Reusing the key for a
different proposal fails. A forged, expired, or mismatched preview token fails before any write.

## Audit data

Successful writes are recorded in `mcp_mutations` with:

- the Voyage user and OAuth client IDs;
- tool name and caller-provided idempotency key;
- a SHA-256 request hash;
- status, resource type, and resource ID;
- the stable result JSON and timestamps.

The audit insert is in the same D1 batch as the trip records, so either the complete mutation
succeeds or none of it is committed.

## Deployment

The following Worker secrets are required in both `voyage-mcp-staging` and `voyage-mcp`:

- `CLERK_JWT_KEY`
- `MCP_CONFIRMATION_SECRET`

From the repository root:

```sh
bun run --cwd apps/mcp db:migrate:staging
bun run deploy:mcp:staging

bun run --cwd apps/mcp db:migrate:production
bun run deploy:mcp:production
```

Verify each environment:

```sh
curl https://mcp-staging.voyageplan.app/health
curl https://mcp.voyageplan.app/health
```

The production CI job applies the shared D1 migrations before deploying the web app and production
MCP Worker.

## Explicitly out of scope

Phase 2A cannot update or delete trips, create transportation, stays, or plans, invite
collaborators, or import Gmail data. Those capabilities require later, separately reviewed tools.
