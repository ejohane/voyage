# Voyage iOS release evidence

This ledger records distinct delivery states for the first native iOS candidate. It intentionally
does not treat implementation, deployment, device installation, TestFlight processing, or soak as
interchangeable evidence.

## Candidate

| Field | Value |
| --- | --- |
| Source branch | `codex/voyage-native-ios` |
| Bundle ID | `app.voyage.native` |
| Apple team | `TRA7965NM5` |
| Minimum iOS | iOS 18 |
| Intended distribution | Internal TestFlight |
| Release commit | Pending |
| Marketing version / build | `0.1` / `1` confirmed in unsigned Release archive |

## Implemented and local server validation

- [x] Additive `/api/v1` trip list, aggregate workspace, people, and scheduled-plan mutations.
- [x] Membership checks, version/request headers, ETags, conditional reads, idempotent creates, and
      revision-protected update/delete behavior covered by tests.
- [x] Shared synthetic fixtures stored under `packages/contracts/fixtures/v1`.
- [x] Full Bun gate passed on July 28, 2026 (America/Chicago): Biome, TypeScript, 92 web tests,
      27 MCP tests, eval/plugin verification, and both production builds.
- [x] Native implementation passes strict Swift formatting, static analysis, and all 28 test
      definitions (30 executed cases) with zero failures or skips. Latest repository evidence:
      `.artifacts/ios/20260729T025736Z-89029`.
- [x] Debug and Staging simulator builds and an unsigned Release device archive passed. Archive
      readback confirmed production API/environment, `app.voyage.native`, live Clerk key class,
      compiled app icon, and the checked-in privacy manifest.
- [ ] Local gates rerun at a release commit.
- [ ] Matching GitHub Ubuntu and macOS jobs passed with retained iOS evidence.

## Service deployment

| Environment | Migration state | Worker version | Readback |
| --- | --- | --- | --- |
| Staging | Through `0016` applied | `0119f012-6c75-4f2f-a2ff-80954ecb980e` | July 28 readback: health reports `staging`; unauthenticated v1 returns `401` with API version, request ID, and typed error. |
| Production | Through `0016` applied | `7c7ac499-da8e-49c6-8b96-26bd73d9f756` | July 28 readback: health reports `production`; unauthenticated v1 returns `401` with API version, request ID, and typed error. |

The first staging deploy attempt revealed that a redirected Cloudflare Vite config ignores a
Wrangler-only `--env` selection. Production received the already validated additive Worker before
its migration; `0015` was applied immediately and health/contract readback then passed. The deploy
helper now selects the environment at Vite build time and refuses mismatched Worker/environment/D1
output before upload.

Migration `0016` bounds create-plan replay eligibility to seven days, schedules daily cleanup,
performs opportunistic cleanup, and replaces deleted-plan responses with payload-free tombstones.
Both environments reported no pending migrations after the July 28 deployment.

## Authentication and associated domains

- [x] Voyage production Clerk Native API enabled.
- [x] iOS native application registered as `TRA7965NM5.app.voyage.native`.
- [x] Mobile callback allowlisted as `app.voyage.native://callback`.
- [x] Clerk AASA readback contains `TRA7965NM5.app.voyage.native` at
      `https://clerk.voyageplan.app/.well-known/apple-app-site-association`.
- [ ] Production native sign-in completed and its bearer token accepted by Voyage.
- [ ] Membership-scoped production list/workspace/people payloads decoded by the candidate models.

## Apple distribution

- [x] Local signing metadata identifies paid team `TRA7965NM5` and a valid Apple Development
      identity.
- [ ] Explicit App ID and development profile created by automatic signing.
- [ ] Apple Distribution identity and App Store provisioning verified.
- [ ] App Store Connect `Voyage` app record created and agreements verified.
- [x] Unsigned Release archive built and its configuration, icon, entitlements, and privacy manifest
      inspected locally.
- [ ] Signed Release archive validated and uploaded.
- [ ] Build processed and assigned to the intended internal TestFlight group.

App Store Connect remains blocked until the Apple account is signed in for the portal or the
existing API key's issuer ID is supplied. No Apple credential was read, printed, or transmitted
during the audit.

Automatic signing for both a generic device and the connected iPhone stops at provisioning input:
Xcode has no active developer account, the wildcard profile lacks Associated Domains, and no
profile exists for `app.voyage.native`. No device install or launch is claimed.

## Simulator acceptance completed

- [x] Fixture-mode trip list, overview, Today/Coming Up timeline, travel, stay, people, and plan
      creation/editing surfaces built and launched on an iPhone Simulator.
- [x] Empty-title validation surfaced inline and an idempotency-key-backed plan create reconciled
      into the combined timeline.
- [x] A real process restart changed PID, retained the same account-scoped snapshot bytes/hash/mtime,
      rendered the trip and detailed timeline with an honest `Offline snapshot` state, and removed
      mutation controls.
- [x] Accessibility runtime inspection found semantic identifiers and combined labels for the trip,
      timeline entries, editor fields, and critical actions.

These simulator checks are development evidence only. They do not satisfy signed-device,
production-authentication, processed-TestFlight, physical-accessibility, or soak requirements.

## Physical-device and TestFlight acceptance

- [ ] Processed TestFlight build installed and launched on a physical iPhone.
- [ ] Production sign-in/sign-out, authorized reads, plan create/edit/delete, stale conflict, and
      native-to-web/web-to-native readback passed.
- [ ] Last-known-good trip survived airplane-mode relaunch; sign-out and second-account isolation
      passed.
- [ ] Primary flows passed Dynamic Type, VoiceOver order/labels, reduced motion, dark appearance,
      and minimum touch-target checks.
- [ ] No unresolved P0/P1 defects.
- [ ] The same processed TestFlight build completed at least 25 primary-flow sessions across at
      least seven elapsed days with defects and outcomes recorded.
