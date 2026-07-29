#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_ROOT="$REPO_ROOT/apps/web"
TARGET="${1:-}"

case "$TARGET" in
  production)
    EXPECTED_WORKER="voyage"
    EXPECTED_ENVIRONMENT="production"
    EXPECTED_APP_URL="https://voyageplan.app"
    EXPECTED_ROUTES='[
      {"pattern":"voyageplan.app","custom_domain":true},
      {"pattern":"www.voyageplan.app","custom_domain":true}
    ]'
    EXPECTED_DATABASE_NAME="voyage-production"
    EXPECTED_DATABASE_ID="d6747c04-a897-4d16-afc4-eff3d29acd6a"
    ;;
  staging)
    EXPECTED_WORKER="voyage-staging"
    EXPECTED_ENVIRONMENT="staging"
    EXPECTED_APP_URL="https://staging.voyageplan.app"
    EXPECTED_ROUTES='[
      {"pattern":"staging.voyageplan.app","custom_domain":true}
    ]'
    EXPECTED_DATABASE_NAME="voyage-staging"
    EXPECTED_DATABASE_ID="1d861d6e-f26a-4449-95b9-2eb4a6da5008"
    ;;
  *)
    echo "usage: $0 <production|staging>" >&2
    exit 2
    ;;
esac

if [[ -z "${VITE_CLERK_PUBLISHABLE_KEY:-}" ]]; then
  echo "error: VITE_CLERK_PUBLISHABLE_KEY must be supplied through the approved environment." >&2
  exit 1
fi

cd "$WEB_ROOT"

GENERATED_CONFIG="$WEB_ROOT/dist/voyage/wrangler.json"
DEPLOY_REDIRECT="$WEB_ROOT/.wrangler/deploy/config.json"

# A successful build must recreate both files. Removing old copies prevents a stale redirect or
# generated configuration from being accepted when the build no longer produces deployment output.
rm -f -- "$GENERATED_CONFIG" "$DEPLOY_REDIRECT"

if [[ "$TARGET" == "staging" ]]; then
  CLOUDFLARE_ENV=staging bunx vite build
else
  env -u CLOUDFLARE_ENV bunx vite build
fi

if [[ ! -f "$GENERATED_CONFIG" ]]; then
  echo "error: Cloudflare Vite output is missing $GENERATED_CONFIG" >&2
  exit 1
fi

if ! jq -e \
  --arg worker "$EXPECTED_WORKER" \
  --arg environment "$EXPECTED_ENVIRONMENT" \
  --arg app_url "$EXPECTED_APP_URL" \
  --argjson routes "$EXPECTED_ROUTES" \
  --arg database_name "$EXPECTED_DATABASE_NAME" \
  --arg database "$EXPECTED_DATABASE_ID" \
  '.name == $worker
    and .vars.ENVIRONMENT == $environment
    and .vars.APP_URL == $app_url
    and ((.routes | map({pattern, custom_domain}) | sort_by(.pattern))
      == ($routes | sort_by(.pattern)))
    and (.d1_databases | length == 1)
    and .d1_databases[0].binding == "DB"
    and .d1_databases[0].database_name == $database_name
    and .d1_databases[0].database_id == $database' \
  "$GENERATED_CONFIG" >/dev/null; then
  echo "error: refusing to deploy; generated Cloudflare configuration does not match $TARGET." >&2
  jq '{
    name,
    environment: .vars.ENVIRONMENT,
    appUrl: .vars.APP_URL,
    routes: (.routes | map({pattern, custom_domain})),
    databaseName: .d1_databases[0].database_name,
    databaseId: .d1_databases[0].database_id
  }' \
    "$GENERATED_CONFIG" >&2
  exit 1
fi

if [[ ! -f "$DEPLOY_REDIRECT" ]]; then
  echo "error: Cloudflare Vite output is missing deploy redirect $DEPLOY_REDIRECT" >&2
  exit 1
fi

REDIRECTED_CONFIG_PATH="$(jq -er '.configPath | select(type == "string" and length > 0)' \
  "$DEPLOY_REDIRECT")" || {
  echo "error: deploy redirect does not contain a valid configPath." >&2
  exit 1
}

if [[ "$REDIRECTED_CONFIG_PATH" == /* ]]; then
  REDIRECTED_CONFIG="$REDIRECTED_CONFIG_PATH"
else
  REDIRECTED_CONFIG="$(dirname "$DEPLOY_REDIRECT")/$REDIRECTED_CONFIG_PATH"
fi

if [[ ! -f "$REDIRECTED_CONFIG" ]]; then
  echo "error: deploy redirect points to a missing configuration: $REDIRECTED_CONFIG_PATH" >&2
  exit 1
fi

REDIRECTED_CONFIG="$(cd "$(dirname "$REDIRECTED_CONFIG")" && pwd -P)/$(basename "$REDIRECTED_CONFIG")"
GENERATED_CONFIG="$(cd "$(dirname "$GENERATED_CONFIG")" && pwd -P)/$(basename "$GENERATED_CONFIG")"

if [[ "$REDIRECTED_CONFIG" != "$GENERATED_CONFIG" ]]; then
  echo "error: refusing to deploy; redirect does not point to the verified generated configuration." >&2
  echo "expected: $GENERATED_CONFIG" >&2
  echo "actual:   $REDIRECTED_CONFIG" >&2
  exit 1
fi

echo "Verified generated Cloudflare target: $TARGET ($EXPECTED_WORKER)."
bunx wrangler deploy --config "$GENERATED_CONFIG"
