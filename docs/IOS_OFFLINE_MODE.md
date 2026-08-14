# Voyage iOS seamless offline mode

## Product decision

Voyage's canonical native iOS app automatically keeps every trip the signed-in person can access
available for read-only browsing when the network is unavailable. Offline behavior is part of the
normal app lifecycle: there is no offline-mode toggle, download action, per-trip opt-in, or manual
cache management UI.

The first version is deliberately read-only. It does not queue trip creation, plan edits, Gmail
imports, or any other mutation, and it does not introduce conflict resolution. A stale workspace
keeps its existing editing controls unavailable until a successful refresh proves that the session
is online and the person's current role still permits the action.

This plan applies only to `apps/ios/Voyage`, the canonical native iOS client. The web client is out
of scope.

## Data boundary

The durable snapshot contains the essential values already available through Voyage's versioned
native API:

- the complete accessible trip index;
- each trip workspace, including destinations, itinerary plans, transportation, stays, addresses,
  confirmation numbers, booking links, and notes;
- the policy-filtered people response for each trip;
- the latest generated arrival briefing; and
- a last-known Apple Maps arrival-route estimate when one has been calculated on the device.

Voyage does not currently have a native document model or document-download API, so there is no
document payload to snapshot in this version. Gmail scans/imports, new route calculations, remote
property media, weather, collaboration changes, and other provider-backed results remain live-only.
When a useful last-known route or briefing exists, the app may show it with its saved time. When no
saved value exists, the affected row degrades to an unobtrusive unavailable/retry state without
blocking the rest of the trip.

## Storage and security decisions

- Continue using an app-owned Application Support file per Clerk user. The opaque filename is the
  SHA-256 digest of the stable user ID and contains no user-provided text.
- Continue atomic whole-store writes with complete file protection and exclusion from device
  backups. Session tokens remain in Clerk's Keychain-backed storage and are never serialized with
  trip content.
- Advance the on-disk store schema when adding snapshot kinds. Decode the previous schema
  additively so existing trip-index and workspace snapshots survive the upgrade; discard corrupt or
  unsupported stores rather than risking a partial decode.
- Treat a complete, authenticated trip-index refresh as the retention authority. After it succeeds,
  remove snapshots for trips no longer present. A confirmed `403` or `404` for an individual trip
  also removes that trip's workspace, people, briefing, and route entries. Keep accessible trip data
  without an arbitrary age expiry so an older trip remains useful offline until the server confirms
  access loss or the person signs out.
- Purge the current account's complete snapshot before Clerk sign-out. Account namespaces never
  share data.

## Lifecycle and invalidation

1. At sign-in or launch, restore the saved trip index before making a network request.
2. Refresh the trip index opportunistically with its existing `ETag`.
3. As soon as either a saved or refreshed index is available, schedule background refreshes for
   every listed trip. Restore each saved workspace, people response, and briefing before its network
   request completes.
4. On a complete `200` response, atomically replace that snapshot. On `304`, retain the decoded
   value and advance its successful-refresh time. A canceled, failed, or malformed response never
   replaces readable data.
5. Route estimates are keyed by the complete route request, not only by trip ID. A changed airport,
   stay, or address therefore invalidates the old estimate. A saved estimate renders immediately;
   Apple Maps refreshes it opportunistically when available.
6. Foreground pull-to-refresh remains a normal refresh gesture, not an offline-management control.

## Increment plan

### Increment 1 — protected snapshot foundation

Extend the versioned snapshot store to persist people, arrival briefings, and route estimates. Add
focused tests for account isolation, additive migration, corrupt-store recovery, scoped trip
removal, pruning after a confirmed accessible-trip index, route-request invalidation, atomic
round-trips, and purge behavior.

Validation gate: snapshot-cache tests and an iOS build must pass before session behavior changes.

### Increment 2 — automatic local-first refresh

Teach `VoyageSession` to restore every supported value before refreshing it, preserve saved values
on transport/auth/decode failures, and refresh all trips from the accessible index in the
background without delaying the trip list. A successful index refresh prunes inaccessible trip
snapshots; confirmed per-trip access loss evicts every snapshot kind for that trip.

Validation gate: focused session tests must prove immediate stale restoration, successful
replacement/touch behavior, background refresh coverage for every trip, failure preservation, and
access-loss eviction.

### Increment 3 — read-only and live-data degradation

Keep mutation entry points hidden whenever a workspace is stale, including plan and provider-import
actions. Show only small freshness cues where the age affects interpretation: saved arrival
briefings, people, and last-known route estimates. When a live-only value has no snapshot, show a
small unavailable/retry row or omit the optional enrichment; never replace the trip screen with a
network error.

Validation gate: UI/state tests and a simulator build must confirm that saved trip browsing remains
available while offline and editing remains unavailable.

### Increment 4 — integrated verification

Run formatting, all native unit tests, and the canonical iOS build gate. Exercise the cached-fixture
then offline-fixture launch path in Simulator when the local configuration permits it. Report build,
test, launch, and visible-UI evidence as distinct states.

## Completion boundary

This first version is complete when every accessible trip is snapshotted automatically, essential
saved trip data opens locally first, optional live-only features fail independently, offline
mutations cannot be initiated from stale screens, and sign-out/access-loss retention rules are
covered by tests. Offline writes, binary document downloads, background refresh while the app is
terminated, and cross-device cache synchronization remain later work.
