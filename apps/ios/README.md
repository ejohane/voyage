# Voyage for iOS

Native iPhone app for Voyage. The project targets iOS 18 and uses Swift 6 with complete strict-concurrency checking.

## Local configuration

1. Copy `Configuration/Local.xcconfig.example` to `Configuration/Local.xcconfig`.
2. Set `VOYAGE_CLERK_PUBLISHABLE_KEY` in that ignored file.

All configurations use bundle identifier `app.voyage.native`, matching Voyage's Clerk native application registration. Debug and Staging use `https://staging.voyageplan.app`; Release uses `https://voyageplan.app`.

The Clerk callback is `app.voyage.native://callback`. The app entitlement includes `webcredentials:clerk.voyageplan.app`.

## Build and test

```sh
xcodebuild build \
  -project apps/ios/Voyage.xcodeproj \
  -scheme Voyage \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO

xcodebuild test \
  -project apps/ios/Voyage.xcodeproj \
  -scheme Voyage \
  -testPlan Voyage-CI \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.2'

swift format lint --strict \
  --configuration apps/ios/.swift-format \
  --recursive apps/ios/Voyage apps/ios/VoyageTests
```

The unsigned generic-Simulator build above is compile-only. Do not install or launch that artifact:
iOS Keychain calls require the simulated application identifier that Xcode embeds when it signs a
Simulator app. Use Xcode's Run action or omit `CODE_SIGNING_ALLOWED=NO` for any launched build. The
repository test gate signs its hosted Simulator app for the same reason.

The test target consumes the canonical sanitized API fixtures directly from `packages/contracts/fixtures/v1`.

## Fixture launch mode

In Debug or Staging, pass `-voyage-fixture-mode` as a launch argument or set `VOYAGE_FIXTURE_MODE=1`. Fixture mode bypasses Clerk and uses deterministic local data, so UI states can be exercised without a live account.

## Account data

Snapshots are stored per Clerk user, atomically written with iOS file protection, and excluded from backup. Signing out purges the current user's snapshot before ending the Clerk session. The app also covers its content when it leaves the active scene so trip data is not exposed in the app switcher.
