#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PROJECT_PATH="${VOYAGE_IOS_PROJECT:-apps/ios/Voyage.xcodeproj}"
SCHEME="${VOYAGE_IOS_SCHEME:-Voyage}"
CONFIGURATION="${VOYAGE_IOS_CONFIGURATION:-Debug}"
ARTIFACTS_ROOT="${VOYAGE_IOS_ARTIFACTS_DIR:-$REPO_ROOT/.artifacts/ios}"
KEEP_SIMULATOR_BOOTED="${VOYAGE_IOS_KEEP_SIMULATOR_BOOTED:-0}"

case "$PROJECT_PATH" in
  /*) ;;
  *) PROJECT_PATH="$REPO_ROOT/$PROJECT_PATH" ;;
esac

case "$ARTIFACTS_ROOT" in
  /*) ;;
  *) ARTIFACTS_ROOT="$REPO_ROOT/$ARTIFACTS_ROOT" ;;
esac

if [[ ! -d "$PROJECT_PATH" ]]; then
  echo "error: iOS project not found at $PROJECT_PATH" >&2
  echo "Set VOYAGE_IOS_PROJECT if the project is in a different location." >&2
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1 \
  || ! command -v xcrun >/dev/null 2>&1 \
  || ! command -v jq >/dev/null 2>&1; then
  echo "error: Xcode command-line tools and jq are required to validate the iOS app." >&2
  exit 1
fi

RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="$ARTIFACTS_ROOT/$RUN_STAMP-$$"
RESULT_BUNDLE="$RUN_DIR/VoyageTests.xcresult"
mkdir -p "$RUN_DIR"

DERIVED_DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyage-ios-check.XXXXXX")"
BOOTED_BY_SCRIPT=0
DESTINATION_ID=""

cleanup() {
  local status=$?
  trap - EXIT

  if [[ "$BOOTED_BY_SCRIPT" == "1" && "$KEEP_SIMULATOR_BOOTED" != "1" && -n "$DESTINATION_ID" ]]; then
    xcrun simctl shutdown "$DESTINATION_ID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$DERIVED_DATA_DIR" && -d "$DERIVED_DATA_DIR" ]]; then
    rm -rf -- "$DERIVED_DATA_DIR"
  fi

  echo "iOS validation artifacts: $RUN_DIR"
  exit "$status"
}
trap cleanup EXIT

{
  echo "run_started_at=$RUN_STAMP"
  echo "project=$PROJECT_PATH"
  echo "scheme=$SCHEME"
  echo "configuration=$CONFIGURATION"
  xcodebuild -version
  xcrun swift --version
  xcrun simctl list runtimes
} >"$RUN_DIR/environment.log" 2>&1

if ! xcodebuild -project "$PROJECT_PATH" -list -json >"$RUN_DIR/project.json" 2>"$RUN_DIR/project-list.log"; then
  cat "$RUN_DIR/project-list.log" >&2
  echo "error: could not inspect $PROJECT_PATH" >&2
  exit 1
fi

if ! xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -showdestinations >"$RUN_DIR/destinations.log" 2>&1; then
  cat "$RUN_DIR/destinations.log" >&2
  echo "error: scheme '$SCHEME' must exist and be shared." >&2
  exit 1
fi

extract_simulator_ids() {
  local iphones_only="$1"
  awk -v iphones_only="$iphones_only" '
    /platform:iOS Simulator/ {
      if (iphones_only == "1" && $0 !~ /name:iPhone/) next
      if (match($0, /id:[[:space:]]*[0-9A-Fa-f-]+/)) {
        id = substr($0, RSTART, RLENGTH)
        sub(/^id:[[:space:]]*/, "", id)
        if (length(id) == 36 && !seen[toupper(id)]++) print toupper(id)
      }
    }
  ' "$RUN_DIR/destinations.log"
}

CANDIDATE_IDS="$(extract_simulator_ids 1)"
if [[ -z "$CANDIDATE_IDS" ]]; then
  CANDIDATE_IDS="$(extract_simulator_ids 0)"
fi

if [[ -z "$CANDIDATE_IDS" ]]; then
  cat "$RUN_DIR/destinations.log" >&2
  echo "error: scheme '$SCHEME' has no available iOS Simulator destination." >&2
  exit 1
fi

is_booted() {
  local candidate_id="$1"
  xcrun simctl list devices available | awk -v id="$candidate_id" '
    index(toupper($0), toupper(id)) > 0 && /\(Booted\)/ { found = 1 }
    END { exit(found ? 0 : 1) }
  '
}

if [[ -n "${VOYAGE_IOS_DESTINATION_ID:-}" ]]; then
  REQUESTED_ID="$(printf '%s' "$VOYAGE_IOS_DESTINATION_ID" | tr '[:lower:]' '[:upper:]')"
  if ! printf '%s\n' "$CANDIDATE_IDS" | awk -v id="$REQUESTED_ID" '
    toupper($0) == toupper(id) { found = 1 }
    END { exit(found ? 0 : 1) }
  '; then
    cat "$RUN_DIR/destinations.log" >&2
    echo "error: VOYAGE_IOS_DESTINATION_ID '$REQUESTED_ID' is not valid for scheme '$SCHEME'." >&2
    exit 1
  fi
  DESTINATION_ID="$REQUESTED_ID"
else
  while IFS= read -r candidate_id; do
    if [[ -n "$candidate_id" ]] && is_booted "$candidate_id"; then
      DESTINATION_ID="$candidate_id"
      break
    fi
  done <<EOF
$CANDIDATE_IDS
EOF

  if [[ -z "$DESTINATION_ID" ]]; then
    DESTINATION_ID="$(printf '%s\n' "$CANDIDATE_IDS" | awk 'NF { print; exit }')"
  fi
fi

DEVICE_LINE="$(xcrun simctl list devices available | awk -v id="$DESTINATION_ID" '
  index(toupper($0), toupper(id)) > 0 { sub(/^[[:space:]]*/, ""); print; exit }
')"
if [[ -z "$DEVICE_LINE" ]]; then
  echo "error: selected simulator '$DESTINATION_ID' is no longer available." >&2
  exit 1
fi

{
  echo "destination_id=$DESTINATION_ID"
  echo "destination=$DEVICE_LINE"
} | tee -a "$RUN_DIR/environment.log"

if ! is_booted "$DESTINATION_ID"; then
  echo "Booting simulator $DEVICE_LINE"
  xcrun simctl boot "$DESTINATION_ID"
  BOOTED_BY_SCRIPT=1
fi
xcrun simctl bootstatus "$DESTINATION_ID" -b | tee "$RUN_DIR/simulator-boot.log"

echo "Resolving Swift package dependencies"
xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -resolvePackageDependencies 2>&1 | tee "$RUN_DIR/package-resolution.log"

if xcrun --find swift-format >/dev/null 2>&1; then
  FORMAT_CONFIGURATION=""
  if [[ -f "$REPO_ROOT/apps/ios/.swift-format" ]]; then
    FORMAT_CONFIGURATION="$REPO_ROOT/apps/ios/.swift-format"
  elif [[ -f "$REPO_ROOT/.swift-format" ]]; then
    FORMAT_CONFIGURATION="$REPO_ROOT/.swift-format"
  fi

  echo "Linting Swift formatting"
  if [[ -n "$FORMAT_CONFIGURATION" ]]; then
    xcrun swift-format lint \
      --strict \
      --recursive \
      --configuration "$FORMAT_CONFIGURATION" \
      "$REPO_ROOT/apps/ios" 2>&1 | tee "$RUN_DIR/format.log"
  else
    xcrun swift-format lint \
      --strict \
      --recursive \
      "$REPO_ROOT/apps/ios" 2>&1 | tee "$RUN_DIR/format.log"
  fi
else
  echo "error: this Xcode toolchain does not provide swift-format." | tee "$RUN_DIR/format.log" >&2
  exit 1
fi

COMMON_XCODEBUILD_ARGUMENTS=(
  -project "$PROJECT_PATH"
  -scheme "$SCHEME"
  -configuration "$CONFIGURATION"
  -sdk iphonesimulator
  -destination "platform=iOS Simulator,id=$DESTINATION_ID"
  -destination-timeout 120
  -derivedDataPath "$DERIVED_DATA_DIR"
)

echo "Running static analysis"
NSUnbufferedIO=YES xcodebuild \
  "${COMMON_XCODEBUILD_ARGUMENTS[@]}" \
  analyze \
  CODE_SIGNING_ALLOWED=NO \
  COMPILER_INDEX_STORE_ENABLE=NO 2>&1 | tee "$RUN_DIR/analyze.log"

echo "Running tests"
NSUnbufferedIO=YES xcodebuild \
  "${COMMON_XCODEBUILD_ARGUMENTS[@]}" \
  -enableCodeCoverage YES \
  -parallel-testing-enabled NO \
  -resultBundlePath "$RESULT_BUNDLE" \
  test \
  CODE_SIGNING_ALLOWED=NO \
  COMPILER_INDEX_STORE_ENABLE=NO 2>&1 | tee "$RUN_DIR/test.log"

echo "Reading test result summary"
if ! xcrun xcresulttool get test-results summary \
  --path "$RESULT_BUNDLE" >"$RUN_DIR/test-summary.json" 2>"$RUN_DIR/test-summary.log"; then
  cat "$RUN_DIR/test-summary.log" >&2
  echo "error: could not read the test count from $RESULT_BUNDLE" >&2
  exit 1
fi

TEST_COUNT="$(jq -er '.totalTestCount | select(type == "number" and . > 0)' \
  "$RUN_DIR/test-summary.json")" || {
  jq '{result, totalTestCount, passedTests, failedTests, skippedTests}' \
    "$RUN_DIR/test-summary.json" >&2
  echo "error: iOS validation completed without a positive test count." >&2
  exit 1
}

echo "iOS validation passed with $TEST_COUNT tests."
