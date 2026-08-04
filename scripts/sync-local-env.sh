#!/usr/bin/env bash

set -euo pipefail

sync_all=false
if [[ "${1:-}" == "--all" ]]; then
  sync_all=true
elif [[ $# -ne 0 ]]; then
  echo "Usage: $0 [--all]" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
common_git_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
primary_checkout="$(dirname "$common_git_dir")"

local_env_files=(
  "apps/web/.env.local"
  "apps/web/.dev.vars"
)

for env_file in "${local_env_files[@]}"; do
  if [[ ! -s "$primary_checkout/$env_file" ]]; then
    echo "Missing canonical local environment file: $primary_checkout/$env_file" >&2
    echo "Add it to the primary checkout before syncing worktrees." >&2
    exit 1
  fi
done

sync_checkout() {
  local checkout="$1"

  if [[ "$checkout" == "$primary_checkout" ]]; then
    return
  fi

  for env_file in "${local_env_files[@]}"; do
    local destination="$checkout/$env_file"
    mkdir -p "$(dirname "$destination")"
    install -m 600 "$primary_checkout/$env_file" "$destination"
    echo "Synced $env_file to $checkout"
  done
}

if [[ "$sync_all" == "true" ]]; then
  while IFS= read -r checkout; do
    sync_checkout "$checkout"
  done < <(git worktree list --porcelain | sed -n 's/^worktree //p')
else
  sync_checkout "$repo_root"
fi

echo "Local environment source: $primary_checkout"
echo "Local environment sync complete."
