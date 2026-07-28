# Voyage MCP Phase 2B

Phase 2B extends Voyage's confirmed additive write boundary to existing trip workspaces. An
authenticated ChatGPT user with owner or editor access can add a mixed batch of transportation,
stays, and itinerary plans after reviewing one exact preview.

## Tools

- `get_trip` returns the current workspace and destination IDs needed by the write flow.
- `preview_itinerary_items` validates 1–50 total additions without writing. It resolves the
  selected trip and destination names, returns exact normalized items, and issues a signed
  confirmation token that expires after 30 minutes.
- `add_itinerary_items` atomically saves the unchanged confirmed batch and its mutation audit.
  It returns the trip link and stable IDs and labels for every created item.

Each item array is explicit, including empty arrays:

- up to 20 transportation items;
- up to 20 stays;
- up to 50 plans;
- no more than 50 items across the complete batch.

Transportation uses local `YYYY-MM-DDTHH:MM` values, stays use `YYYY-MM-DD` dates, and plans use
local dates plus optional `HH:MM` times. Destination references must be IDs returned by `get_trip`
for the same trip. Airport catalog IDs are intentionally not accepted in this phase; flights can
still retain their human-readable departure and arrival locations.

## Confirmation and authorization

1. ChatGPT calls `get_trip` for the selected workspace.
2. ChatGPT assembles the complete additive batch and calls `preview_itinerary_items`.
3. Voyage confirms that the connected user is an owner or editor, validates every field and
   destination reference, and signs the exact proposal including the current trip and destination
   names.
4. ChatGPT shows that exact proposal and obtains explicit user confirmation.
5. ChatGPT calls `add_itinerary_items` with unchanged fields, the signed token, and a fresh UUID
   idempotency key.
6. Voyage rechecks edit access, destination references, and the token before any write.

Viewers and non-members receive the same generic edit-access error. A trip or destination rename
after preview invalidates the token and requires a new preview, preventing a stale proposal from
being saved under changed context.

## Atomicity, audit, and retries

All transportation, stay, plan, and `mcp_mutations` inserts share one D1 batch. The entire batch
commits or none of it does. Successful audits use `tool_name = 'add_itinerary_items'`,
`resource_type = 'trip_itinerary_batch'`, and the target trip ID.

An exact retry by the same user with the same idempotency key returns the original result without
creating duplicates. Reusing the key for a different normalized request fails. The write tool is
annotated as non-destructive, private, and idempotent; the preview tool is read-only.

## Deployment and verification

Phase 2B uses the existing isolated environments and secrets from Phase 2A. No new database
migration or Worker binding is required.

```sh
bun run check
bun run deploy:mcp:staging
MCP_RESOURCE_URL=https://mcp-staging.voyageplan.app bun run --cwd apps/mcp verify:oauth
```

After deploying staging, refresh the Voyage developer plugin so ChatGPT reloads the tool list.
Verify preview, explicit confirmation, native write permission, the returned Voyage trip link,
`get_trip` readback, and the `mcp_mutations` audit before production release.

## Explicitly out of scope

Phase 2B cannot update or delete existing data, create or change trip destinations, invite
collaborators, search the airport catalog, or import Gmail data. Those capabilities require later,
separately reviewed tools.
