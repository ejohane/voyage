# Voyage iOS validation and release

## Quality gates

Run the web/Worker and native gates separately from the repository root:

```sh
bun install --frozen-lockfile
bun run configure:ios
bun run check
bun run check:ios
```

`bun run configure:ios` requires an authenticated GitHub CLI. It reads
`VITE_CLERK_PUBLISHABLE_KEY` from the repository's `production` environment and atomically writes
the ignored `apps/ios/Configuration/Local.xcconfig` without printing the value. It fails if GitHub
authentication or the live publishable key is unavailable. Re-run it after a key rotation and never
copy the resulting file into source control or release evidence.

`bun run check` remains the Linux-compatible monorepo gate: Biome, TypeScript, Worker tests, and
production builds. `bun run check:ios` is the deterministic Xcode gate. It:

1. verifies `apps/ios/Voyage.xcodeproj` and the shared `Voyage` scheme;
2. obtains the scheme's valid Simulator destinations;
3. prefers an already booted iPhone, otherwise boots the first valid iPhone destination;
4. resolves Swift package dependencies;
5. enforces `swift-format` lint;
6. runs Xcode static analysis;
7. runs unit tests serially with code coverage and an `.xcresult` bundle, preserving normal
   Simulator signing so the hosted app has the application identifier required by Keychain;
8. shuts down only a simulator it booted and reports the evidence directory.

Local evidence is written under `.artifacts/ios/<UTC timestamp>-<process id>/` and is ignored by
Git. Set `VOYAGE_IOS_DESTINATION_ID` to require a particular available simulator, or
`VOYAGE_IOS_KEEP_SIMULATOR_BOOTED=1` to leave a simulator booted after the gate. Project, scheme,
configuration, and artifact root also have explicit `VOYAGE_IOS_*` overrides for diagnostics; CI
uses the repository defaults.

`CODE_SIGNING_ALLOWED=NO` is reserved for compile-only analysis/build checks. Do not install or
launch an unsigned Simulator product: Clerk persists its client and device token in the ordinary
iOS Keychain, whose simulator access still requires Xcode's simulated application identifier. No
Keychain Sharing capability or Clerk access group is needed.

GitHub Actions preserves the existing Ubuntu/Bun validation and runs iOS validation independently
on a macOS runner. The artifact step always uploads the evidence produced before the gate exits and
retains it for 14 days. A formatter or analyzer failure occurs before tests, so those failures do not
produce a test log or `.xcresult`; once testing starts, its log and result bundle are uploaded as
available. Production deployment depends on both jobs.

## Build configuration

Before release:

- `Release.xcconfig` contains no development host, debug feature flag, or secret.
- Bundle identifier, Apple team, signing certificate, and provisioning profile resolve to the
  production Voyage app record.
- Marketing version and build number are incremented monotonically in the archived target.
- The deployment target and supported device family match the App Store record.
- The `Voyage` scheme is shared and its Archive action uses Release configuration.
- Clerk publishable configuration and the Voyage API base URL point to production. Secret or
  privileged Clerk keys never enter the app bundle.
- `PrivacyInfo.xcprivacy`, entitlements, usage descriptions, app icon, launch presentation, and
  exported encryption answer match the archived binary.

## Server readiness

The native app is not release-ready merely because it builds. Before archiving a candidate, deploy
the additive v1 backend and record production evidence for:

- native Clerk sign-in with signature/time/subject verification and the route-scoped `/api/v1`
  policy: an absent `azp` is allowed only without a browser `Origin`, while a present `azp` must
  satisfy `CLERK_AUTHORIZED_PARTIES`;
- membership-scoped `GET /api/v1/trips`, workspace, and people responses;
- `X-Voyage-API-Version`, `X-Request-ID`, `ETag`, and `304` behavior;
- owner/editor plan creation with idempotent replay;
- stale update/delete conflict handling and viewer mutation denial;
- native decoding of an exact production response through the candidate's Swift models.

Use a dedicated non-sensitive test trip. Remove temporary server data after verification through the
normal product workflow; do not put production payloads in source fixtures or CI artifacts.

## Staging deployment

The iOS Debug and Staging configurations target `https://staging.voyageplan.app`. The staging Worker
uses its own Cloudflare environment and `voyage-staging` D1 database. From the repository root:

```sh
bun run check
bun run db:migrate:staging
bun run deploy:staging
```

Supply `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and
`VITE_CLERK_PUBLISHABLE_KEY` through the invoking environment or approved secret store. Do not paste
their values into shell history, documentation, or checked-in configuration. Configure any Worker
secrets explicitly for the `staging` Wrangler environment; Cloudflare environment secrets are not a
reason to reuse production credentials.

The deploy helper selects the Cloudflare environment at Vite build time and refuses to upload unless
the generated Worker name, environment value, and D1 database ID match the requested target. Do not
bypass this readback with a direct `wrangler deploy --env` call; redirected Vite deploy configs are
already flattened before Wrangler runs.

Apply migrations before deploying code that reads them. After deployment, verify
`https://staging.voyageplan.app/api/health`, then exercise the v1 contract with a staging test
membership and record request IDs rather than response bodies. A staging deploy does not authorize
or prove a production deploy.

Production keeps separate, explicit commands:

```sh
bun run db:migrate:production
bun run deploy:production
```

Use those only through the production release workflow after both required validation jobs pass.

## Candidate archive and upload

1. Start from a clean release commit and record its full SHA.
2. Run both local gates and wait for the matching GitHub checks to pass.
3. In Xcode, select **Any iOS Device (arm64)** and archive the shared `Voyage` scheme with Release
   configuration.
4. Inspect the archive's bundle ID, versions, signing identity, entitlements, privacy report,
   embedded frameworks, and absence of local configuration files.
5. Validate the archive in Organizer, resolve every error, and retain the validation result.
6. Upload through Organizer to the intended App Store Connect app and record upload time and build
   number.
7. Wait until processing finishes. Resolve export-compliance, content-rights, privacy, or missing-
   compliance questions; an upload alone is not a processed TestFlight build.
8. Add the processed build to an internal TestFlight group with focused test notes. External testing
   additionally requires complete beta review metadata and Apple approval.

## TestFlight verification

Install the processed build from TestFlight on a physical iPhone. Do not substitute an Xcode-installed
development build for this evidence.

- [ ] Clean install launches without a debugger or developer configuration.
- [ ] Sign-in and sign-out complete with the production Clerk environment.
- [ ] Trip list includes only the test account's memberships.
- [ ] Trip detail renders destinations, travel, stays, scheduled plans, and people.
- [ ] Date-only and local-time values match the web app in a non-default device time zone.
- [ ] Owner/editor can create, edit, and delete a plan; a retry does not duplicate creation.
- [ ] Viewer sees mutation controls disabled and the server rejects a direct mutation.
- [ ] A deliberate stale plan update shows a recoverable conflict and preserves the server value.
- [ ] After one successful refresh, airplane mode relaunch renders the last-known-good trip with an
      honest offline/stale state.
- [ ] Sign-out removes cached trip data; signing into a second account cannot reveal it.
- [ ] Empty, slow, offline, expired-session, membership-loss, and server-error states are readable
      and recoverable.
- [ ] Dynamic Type, VoiceOver labels/order, reduced motion, dark appearance, and minimum touch
      targets are usable on the primary flows.
- [ ] No sensitive payload appears in device logs, screenshots intended for review, or exported
      diagnostics.

### Internal TestFlight soak gate

The processed internal TestFlight candidate must accumulate both of these thresholds before release:

- at least **7 elapsed days** since the candidate became available to internal testers; and
- at least **25 completed primary-flow sessions** on that same processed build.

A completed primary-flow session includes TestFlight launch, production sign-in or valid session
restoration, trip-list load, one workspace load, and a scheduled-plan create/edit/delete exercise by
an authorized tester (or the explicitly assigned read-only variant for a viewer). Record build,
tester/device, timestamp, flow result, and any defect without copying trip content. There must be zero
unresolved P0 or P1 defects at the end of the soak; all lower-severity findings are logged and have an
explicit release disposition.

Seven calendar days cannot be compressed by additional simulator runs. Simulator sessions,
Xcode-installed developer builds, earlier TestFlight builds, and an uploaded-but-unprocessed build do
not count toward either threshold.

## Release evidence ledger

Record evidence as separate states; never collapse them into “shipped.”

| State | Required evidence |
| --- | --- |
| Implemented | Commit SHA and reviewed scope. |
| Locally validated | Passing Bun output, iOS run directory, Xcode/Simulator versions, analyzer log, and `.xcresult`. |
| CI validated | Links to successful Ubuntu and macOS jobs and the iOS artifact name. |
| Production API verified | Timestamp, redacted account/trip identifiers, request IDs, statuses, and contract assertions. |
| Archived and validated | Archive version/build, signing identity summary, privacy report review, and Organizer validation. |
| Uploaded | App Store Connect app, build number, and upload timestamp. |
| Processed | App Store Connect processing state and compliance answers. |
| TestFlight installed | Tester/device/iOS version and TestFlight build. |
| TestFlight launched and exercised | Completed physical-device checklist with defects or screenshots. |
| TestFlight soak complete | Candidate availability time, at least 7 elapsed days, at least 25 recorded primary-flow sessions, and zero unresolved P0/P1 defects. |
| Released | App Store version, release mode, availability, and production readback. |

## Definition of done

The initial native release is done only when all of the following are true:

- Product scope works on a physical iPhone: authentication, authorized trip list, trip workspace,
  people, scheduled-plan mutations, and last-known-good offline reading.
- The v1 API is deployed, membership-scoped, versioned, conditionally cacheable, conflict-safe, and
  covered by TypeScript contract tests.
- Swift models decode shared and exact production payloads without changing date-only or local-time
  meaning.
- Per-account snapshots are atomic, survive relaunch offline, and are purged on sign-out; sensitive
  credentials and Google Maps media are excluded.
- Unit tests cover success, empty, offline, malformed payload, auth loss, membership loss,
  idempotent retry, and stale revision behavior.
- `bun run check`, `bun run check:ios`, and both required GitHub jobs pass at the release commit with
  retained evidence.
- The archive is correctly signed and reviewed for entitlements, privacy manifest, SDK disclosures,
  App Store privacy answers, and export compliance.
- The processed TestFlight build—not a developer build—is installed, launched, and exercised on a
  physical iPhone using production authentication and API data.
- That same processed internal TestFlight build has completed a minimum 7-day, 25-primary-flow-session
  soak with every defect logged and zero unresolved P0 or P1 defects; simulator and developer-install
  evidence does not satisfy this elapsed gate.
- Known limitations and deferred web-only capabilities are documented in test notes, and there are
  no unresolved release-blocking defects.

## Rollback

If a candidate fails, remove it from tester groups or stop phased release; do not break v1 to block
the client. Correct the server additively when possible. A client hotfix receives a new build number
and repeats both gates, archive validation, processing, and the relevant physical-device checks.
Retain the prior compatible API behavior until the supported-client policy permits a major-version
retirement.
