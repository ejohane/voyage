# Voyage iOS architecture

## Product boundary

The first native release is an iPhone companion for an existing Voyage account. It is intentionally
smaller than the web application:

- Sign in through the same Clerk instance as the web application.
- List the trips the signed-in user can access.
- Show a trip's destinations, travel, stays, scheduled plans, and members.
- Create, edit, and delete scheduled plans when the membership role permits it.
- Keep the last successfully opened trip data available when the network is unavailable.

Trip creation, invitation management, travel and stay editing, idea management, Gmail import, and
administrative settings remain web-only in this release. The iOS app uses Voyage's versioned HTTP
API directly; it does not use the MCP server as an application backend.

## Runtime shape

```text
Voyage iOS
  ├── Clerk session ───────────────> Clerk
  ├── authenticated /api/v1 calls ─> Cloudflare Worker ─> D1
  └── per-account offline snapshot ─> app-owned local storage

Voyage web
  └── existing /api calls ─────────> Cloudflare Worker ─> D1
```

Both clients share authentication and D1 membership authorization. The versioned mobile contract
is an adapter over the existing repositories, not a second source of trip data.

## Repository and target

- Xcode project: `apps/ios/Voyage.xcodeproj`
- Shared application scheme: `Voyage`
- Application code and resources: `apps/ios/Voyage/`
- Unit tests: `apps/ios/VoyageTests/`
- UI tests, when required for a critical flow: `apps/ios/VoyageUITests/`
- Local validation entry point: `bun run check:ios`

Configuration is expressed through checked-in `.xcconfig` files. Credentials and environment-
specific values must be supplied by an ignored local configuration or the build environment; they
must never be committed in source, project files, fixtures, logs, or result bundles.

## Application layers

The native target keeps dependencies pointed inward:

1. **App and feature views** own navigation, presentation state, accessibility, and user actions.
2. **Stores** coordinate loading, refresh, optimistic mutation state, and explicit error recovery.
3. **Domain models** represent Voyage values without importing SwiftUI or transport details.
4. **API client** owns request construction, bearer authentication, conditional reads, response
   metadata, decoding, and typed errors.
5. **Snapshot store** owns atomic, per-account persistence of last-known trip data.
6. **Authentication adapter** exposes the current Clerk session and supplies short-lived tokens to
   the API client.

Views never write cache files or construct authorization headers. The API client never decides how
an error is presented. Protocol boundaries around the API, token provider, and snapshot store keep
feature tests deterministic.

## Mobile API surface

All routes require a valid Clerk bearer token and D1 trip membership. Inaccessible and nonexistent
trips both return `404`, preventing membership discovery.

| Capability | Route |
| --- | --- |
| List trips | `GET /api/v1/trips` |
| Load a trip snapshot | `GET /api/v1/trips/:tripId/workspace` |
| Load visible members | `GET /api/v1/trips/:tripId/people` |
| Create a scheduled plan | `POST /api/v1/trips/:tripId/plans` |
| Edit a scheduled plan | `PATCH /api/v1/trips/:tripId/plans/:planId` |
| Delete a scheduled plan | `DELETE /api/v1/trips/:tripId/plans/:planId` |

Read responses identify schema version `1`. Trip-list and workspace responses carry a stable
content revision, `ETag`, generation time, and `X-Request-ID`. The client sends `If-None-Match`
when it has a matching snapshot and treats `304` as a successful refresh without replacing the
decoded value.

Scheduled-plan creation sends a new UUID `Idempotency-Key`; a transport retry reuses that key and
the exact encoded body. Updates and deletes send the quoted resource revision in `If-Match`.
`409` is a recoverable conflict that causes a fresh workspace load and an explicit user choice;
the app does not silently overwrite a newer server value. `428` indicates a client bug or an old
request missing its precondition.

## Authentication and authorization

- Clerk owns sign-in and session lifecycle. Session credentials belong in Keychain-backed Clerk
  storage, never in `UserDefaults` or the offline snapshot.
- Each API request asks the session adapter for a current token immediately before sending. A
  refresh may replace an expired token, but an authentication retry is bounded to one attempt.
- The Worker continues to verify the token signature with the production Clerk instance's pinned
  public key, along with its issued-at, activation, expiry, and subject claims, before consulting D1
  membership. Browser and legacy API tokens must include an `azp` claim matching
  `CLERK_AUTHORIZED_PARTIES`. Native `/api/v1` tokens may omit `azp` because Clerk's native flow
  does not send an Origin; if `azp` is present, it must still match the allowlist.
- An azp-less Clerk token proves an authenticated Voyage session, not that the caller is an iOS
  binary. Voyage deliberately limits this exception to the Bearer-only `/api/v1` surface and rejects
  azp-less requests carrying a browser `Origin`; all v1 reads and writes still require D1 membership.
  If the API must become platform-exclusive, add App Attest or another cryptographic client
  attestation rather than treating a missing claim as device identity.
- D1 remains the authorization source of truth. UI role checks are affordances only; every mutation
  is enforced again by the Worker.
- A production token issued by the native Clerk flow must be exercised on a physical device before
  distribution; this cannot be inferred from a web token or simulator-only sign-in.

## Data and time semantics

Voyage contains three different temporal value types and the client must keep them distinct:

- API timestamps such as `createdAt`, `updatedAt`, and `generatedAt` are ISO-8601 instants and may
  decode to `Date`.
- `YYYY-MM-DD` trip and plan dates are calendar-local values. They remain date-only values and are
  formatted with a fixed Gregorian/POSIX parser, never through the device time zone.
- `HH:mm` plan times and local travel strings are wall-clock values. They are not converted to UTC
  unless a future contract also provides an explicit time zone.

Unknown optional values render as absent. A new server enum value must not crash the app or make an
entire trip undecodable; presentation enums provide an unknown fallback and preserve the raw value
when useful for diagnostics.

## Offline and synchronization model

The API is authoritative. Offline storage is a last-known-good snapshot, not a second database:

1. Read the snapshot for the current Clerk user and show it immediately with a stale/offline state.
2. Fetch from the API with the stored `ETag` when connectivity permits.
3. On `200`, decode fully, then atomically replace the snapshot and its metadata.
4. On `304`, retain the snapshot and update the last successful refresh time.
5. On transport failure, retain readable data and show a retry action.
6. On decoding, authorization, or membership failure, do not replace a good snapshot with a partial
   value. Authentication and access loss are presented distinctly from ordinary offline state.

Snapshots are namespaced by Clerk user ID. Signing out deletes that user's snapshots before the
next account may render. Google Maps property media and other remote images are not included in the
offline snapshot. Plan mutations are online-only in this release; the app never presents an
unsubmitted edit as synchronized.

## Observability and failure handling

Every screen has explicit loading, empty, content, stale/offline, and error states. Logs may include
the API route template, status code, `X-Request-ID`, duration, cache outcome, and decoding category.
They must not include bearer tokens, invitation tokens, confirmation numbers, booking URLs, notes,
email addresses, or full response bodies.

The release evidence distinguishes these states:

- compiled and unit-tested in Simulator;
- installed and launched on a physical phone;
- authenticated against production;
- native-decoded from a production response;
- refreshed and then reopened offline;
- uploaded and processed by App Store Connect;
- installed and launched from TestFlight.

One state is not evidence of a later state.

## Rollout order

1. Deploy the additive `/api/v1` contract and production auth configuration.
2. Verify membership-scoped reads, plan mutation safeguards, request IDs, and conditional reads
   against production.
3. Ship a TestFlight build using that contract.
4. Keep `/api/v1` backward compatible for every supported build.
5. Introduce a new API major version before a breaking contract change; never require an App Store
   release and a Worker deploy to happen in lockstep.
