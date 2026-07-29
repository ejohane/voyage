# Voyage iOS privacy and data handling

## Principles

The iOS app receives only the data needed to present and coordinate trips the signed-in member may
access. Voyage's Worker remains the authorization boundary. Local persistence exists to make
previously opened trips useful offline; it is not used for advertising, cross-app tracking, or
behavioral profiling.

The public policy is the Voyage web privacy page. This document is the engineering checklist that
keeps the native implementation, App Store disclosures, and that public policy aligned.

## Data inventory

| Data | Source and purpose | On-device handling |
| --- | --- | --- |
| Clerk account identity, name, email, and session | Sign-in and authenticated API access | Session material uses Clerk's Keychain-backed storage. Never log or place it in the trip cache. |
| Trip, destination, travel, stay, and scheduled-plan data | Present and coordinate accessible trips | Last-known-good values may be stored in a per-account offline snapshot. |
| Member names, roles, and policy-visible emails | Show who is traveling | Treat as personal data; cache only if the people feature explicitly requires offline access. |
| Booking URLs, confirmation numbers, and notes | Show details the user stored in Voyage | Treat as sensitive user content. Never log, index globally, or include in diagnostics. |
| Google Maps property details and photos | Display current property context | Fetch for display only. Exclude from the app-owned offline snapshot. |
| Request metadata | Diagnose failures | Status, duration, route template, cache outcome, and `X-Request-ID` are allowed; bodies and credentials are not. |

The first release does not require Contacts, Photos, Camera, microphone, Bluetooth, precise location,
local-network, health, or motion access. Do not add a usage description or entitlement until a
shipped feature needs it and this inventory has been updated.

## Storage and retention

- Namespace every snapshot by stable Clerk user ID. File names must not contain email addresses,
  trip names, confirmation numbers, or other user-provided text.
- Use Application Support or another app-private container, with iOS data protection enabled. Do
  not put sensitive trip payloads in `UserDefaults`, caches shared between accounts, or iCloud
  containers.
- Write a new snapshot atomically only after complete schema validation. A partial response, decode
  failure, canceled request, or server error cannot replace readable data.
- Purge the current user's snapshots as part of sign-out before rendering another account.
- Remove obsolete schema snapshots when they can no longer be safely migrated.
- Do not persist remote property photos or arbitrary web content in the app-owned offline store.
- Accept server-side create-plan replays for seven days, then purge the expired row on the next
  daily Worker cleanup (a normal physical-retention bound of less than eight days). Replace a
  deleted plan's replay payload with a tombstone immediately, including cascade deletions, and also
  perform opportunistic cleanup on new creates.
- Uninstalling the app removes its container; deleting server-side Voyage data remains a server
  account operation and must be described accurately in the public policy and support process.

## Network and authentication

- Use TLS Voyage and Clerk endpoints only. App Transport Security exceptions are not permitted for
  production hosts.
- Request a current Clerk token just before an API call. Never place tokens in URLs, analytics,
  crash breadcrumbs, copy/paste diagnostics, or committed configuration.
- Enforce membership on every Worker route. Hiding a button in SwiftUI is not authorization.
- Treat `401` as expired or invalid authentication, `403` as insufficient mutation permission, and
  trip `404` as unavailable without revealing whether the trip exists.
- Production native sign-in must be verified against the Clerk authorized-party configuration
  before external TestFlight distribution.

## Logging and diagnostics

Allowed structured fields are operation name, route template, HTTP status, duration, retry count,
cache hit/staleness, decoding category, and server request ID. Redact or omit:

- authorization headers and Clerk session material;
- full URLs with user data or query strings;
- email addresses and account identifiers;
- trip titles and destination text;
- confirmation numbers, booking links, plan notes, and response bodies;
- idempotency keys, which correlate retries even though they are not credentials.

Unit tests must exercise redaction. Simulator `.xcresult` bundles and CI logs are retained as build
evidence, so test fixtures must be synthetic.

## Apple privacy artifacts

Before each App Store submission, the release owner reconciles all three sources of truth:

1. `apps/ios/Voyage/PrivacyInfo.xcprivacy`, including accessed API categories and reasons introduced
   by Voyage or bundled SDKs;
2. App Store Connect App Privacy answers for data collected by Voyage and its third-party SDKs;
3. the public Voyage privacy policy, including the offline copy and service providers.

At minimum, explicitly review account identifiers, contact information, user content/trip details,
diagnostics, and any data Clerk declares for its shipped SDK version. Confirm whether each category
is linked to identity, used only for app functionality, retained server-side, or not collected by
the app. Do not copy an earlier submission's answers without inspecting the archived build's privacy
report and dependency versions.

Voyage does not use App Tracking Transparency unless a future feature introduces cross-company
tracking as Apple defines it. Adding analytics, crash reporting, push notifications, location,
widgets, or new SDKs requires a privacy review before merge.

## Privacy acceptance checklist

- [ ] A fresh account sees only trips authorized by D1 membership.
- [ ] A viewer cannot mutate a scheduled plan through either UI or a direct API request.
- [ ] Signing out removes the account's local snapshots and the next account cannot render them.
- [ ] Offline snapshots exclude bearer tokens and Google Maps media.
- [ ] Logs and test artifacts contain no credentials or production personal data.
- [ ] The archived app's privacy report matches `PrivacyInfo.xcprivacy` and every embedded SDK.
- [ ] App Store Connect disclosures match actual collection and retention behavior.
- [ ] The public privacy page describes native offline storage and current service providers.
- [ ] A release reviewer records the privacy-policy URL and review date in release evidence.
