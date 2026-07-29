# Voyage iOS API compatibility

## Contract promise

`/api/v1` is the compatibility boundary between independently deployed iOS builds and the Voyage
Worker. A shipped build may remain installed long after the server changes, so version 1 must remain
decodable and semantically correct for every supported build.

Every v1 response includes:

- `X-Voyage-API-Version: 1`;
- `X-Request-ID`, which may be reported during support without exposing the response body;
- a JSON error matching the shared Voyage error envelope when a body is allowed.

Successful trip-list and workspace payloads include `schemaVersion: 1`, `generatedAt`, a SHA-256
content `revision`, and an `ETag` containing that revision. `If-None-Match` may produce `304` with no
body. The people response has the same schema metadata but is deliberately separate from the cached
trip workspace because member visibility and privacy differ.

## Endpoint behavior

| Request | Success | Required concurrency behavior |
| --- | --- | --- |
| `GET /api/v1/trips` | `200` list envelope or `304` | Send the stored `ETag` in `If-None-Match`. |
| `GET /api/v1/trips/:id/workspace` | `200` workspace envelope or `304` | Cache only after complete decoding. |
| `GET /api/v1/trips/:id/people` | `200` people envelope | Emails are visible only where server policy permits; invitations are excluded. |
| `POST /api/v1/trips/:id/plans` | `201 { plan }` | Send a UUID `Idempotency-Key`; retry the same body with the same key. |
| `PATCH /api/v1/trips/:id/plans/:planId` | `200 { plan }` | Send `If-Match: "<revision>"`; consume the returned `ETag`. |
| `DELETE /api/v1/trips/:id/plans/:planId` | `204` | Send `If-Match: "<revision>"`. |

A create replay returns `201` and `Idempotency-Replayed: true`. Reusing its key with a different
body returns `409`. The Worker accepts create-plan replays for seven days, purges expired records on
the next daily cleanup and opportunistically on new creates, and replaces a deleted plan's stored
response with a payload-free tombstone for the rest of that window. Scheduled cleanup bounds normal
physical retention to less than eight days while replay eligibility ends at seven days. Retrying a
deleted plan's key therefore returns `409` instead of recreating or disclosing the removed plan.
Clients must abandon a pending create retry after the seven-day window. A missing or malformed
mutation precondition returns `428
precondition_required`; a stale plan revision returns `409 conflict` and `currentRevision`. Owner
and editor memberships can mutate. Viewer memberships receive `403`. Inaccessible and nonexistent
trips are indistinguishable `404` responses.

## Safe and breaking changes

Safe v1 changes are additive and preserve existing meaning:

- adding an optional JSON field;
- adding a route an old client never calls;
- accepting a broader input while preserving old inputs;
- adding a new error detail while retaining the existing error code and status.

These require a new API major version or an explicit compatibility adapter:

- removing or renaming a field;
- changing a field's type, nullability, units, time basis, or meaning;
- making an optional field required;
- changing list ordering when the order is meaningful to the UI;
- narrowing an enum without a client fallback;
- changing authorization visibility or turning a `404` into a membership-disclosing response;
- changing mutation retry or revision semantics.

Server code must deploy before a client that depends on additive fields. Server removal happens only
after telemetry or an explicit support policy proves no supported build uses the old contract.

## Encoding rules

- JSON keys use lower camel case.
- IDs are stable UUID strings and remain opaque to the client.
- Timestamps are ISO-8601 instants with an offset.
- Calendar-local dates use exactly `YYYY-MM-DD`.
- Wall-clock times use exactly `HH:mm` and have no implied UTC conversion.
- Nullable fields remain present-or-null compatible; clients must also tolerate an absent optional
  field added after their release.
- Arrays are empty rather than `null`.
- Scheduled plans in a workspace have a non-null date, a `planned` or `booked` status, and a
  positive integer resource revision.
- Unknown presentation enum values decode to a fallback instead of rejecting the whole workspace.

## Shared fixture and test matrix

Contract changes are complete only when representative JSON is exercised on both sides of the
boundary. Fixtures must be synthetic and contain no production email, booking, confirmation, or
note data.

The Worker test suite proves:

- schema parsing and exact response headers;
- owner, editor, viewer, non-member, and unauthenticated behavior;
- `ETag`/`If-None-Match` behavior for list and workspace reads;
- create replay and same-key/different-body conflict behavior;
- update/delete success, missing precondition, stale revision, and not-found behavior;
- date-only and local-time values are returned byte-for-byte without time-zone shifts.

The Swift test suite proves:

- a complete trip-list, workspace, people, plan, and error fixture decodes;
- absent optional fields and unknown presentation enums remain readable;
- date-only and local-time values survive decoding and formatting in multiple device time zones;
- conditional-read metadata is persisted and `304` retains the existing snapshot;
- a failed decode cannot overwrite a last-known-good snapshot;
- sign-out removes one account's snapshots and cannot expose them to the next account;
- mutation retries reuse their idempotency key and conflicts do not silently overwrite server data.

## Change checklist

Before merging a mobile contract change:

1. Classify it as additive or breaking.
2. Update shared TypeScript schemas and route tests.
3. Add or update synthetic JSON fixtures and Swift decoding tests.
4. Run `bun run check` and `bun run check:ios`.
5. Deploy server changes first and read back the production response headers and JSON.
6. Decode the exact production response through the shipped Swift models when the payload shape
   changed.
7. Record the oldest supported iOS build used for compatibility verification.
8. Update this document and the release evidence if behavior or support policy changed.
