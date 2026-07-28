# MCP Phase 3: controlled corrections and public-beta readiness

Phase 3 completes the safe conversational planning loop and packages Voyage for public review.
Authenticated users can read trips, create trips, add itinerary batches, and correct existing trip
or itinerary fields. Deletion, access changes, external messages, Gmail import, and booking actions
remain unavailable.

## Controlled correction contract

`get_trip` is the revision source. Trip corrections pass `trip.updatedAt`; itinerary corrections
pass each item's `updatedAt`. The paired preview tools return exact before-and-after proposals and
30-minute signed confirmation tokens:

- `preview_trip_update` → `update_trip`
- `preview_itinerary_updates` → `update_itinerary_items`

The write call must preserve every previewed field and revision and include a fresh UUID
idempotency key. Owner and editor memberships may update; viewers and non-members receive the same
unavailable response. Each write rechecks membership, revisions, and destination references. Mixed
itinerary corrections use an atomic D1 guard, so a stale item prevents the entire batch. Successful
writes are recorded in `mcp_mutations` and can be replayed safely with the same key.

Correction tools carry `destructiveHint: true` because they overwrite existing fields, even though
they cannot delete resources. They carry `openWorldHint: false` because changes remain within the
user's private Voyage workspace.

## Public-beta safeguards

- OAuth remains limited to the OIDC `openid` identity scope. D1 membership remains authoritative.
- Cloudflare rate limiting allows 120 authenticated tool calls per account per minute.
- Worker observability records method, response status, session creation, and duration without
  returning or logging account subjects, tokens, or trip content.
- `/.well-known/openai-apps-challenge` serves the exact portal-issued domain token only when the
  `OPENAI_APPS_CHALLENGE` secret is configured.
- The production plugin package lives at `plugins/voyage`, including the production MCP endpoint,
  public listing metadata, brand asset, and `plan-with-voyage` workflow skill.
- `apps/mcp/evals/phase-3.json` contains the five positive and three negative reviewer cases.

## Verification

```bash
bun run --cwd apps/mcp test
bun run --cwd apps/mcp typecheck
bun run --cwd apps/mcp build
bun run check
```

The MCP test command also validates the reviewer eval inventory and the committed plugin manifest,
endpoint, assets, and skill metadata.

After staging deployment, run the OAuth verifier, inspect every tool in MCP Inspector, refresh the
developer connection metadata, and rerun the eval set in a new conversation.

## Deliberately unavailable

Phase 3 cannot delete trips or itinerary items; add, remove, or reorder destinations through the
correction tools; invite or remove collaborators; import or search Gmail; send email or messages;
or make purchases and reservations. Those require separately reviewed scopes and product safety
boundaries.
