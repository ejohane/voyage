#!/usr/bin/env bash

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

base_remote="${VOYAGE_BASE_REMOTE:-origin}"
base_branch="${VOYAGE_BASE_BRANCH:-main}"
base_ref="$base_remote/$base_branch"

echo "Fetching $base_ref..."
git fetch "$base_remote" "$base_branch" --prune

if git merge-base --is-ancestor HEAD "$base_ref"; then
  if [[ "$(git rev-parse HEAD)" == "$(git rev-parse "$base_ref")" ]]; then
    echo "Already up to date with $base_ref."
  elif ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Cannot fast-forward to $base_ref while tracked files have local changes." >&2
    echo "Commit or stash those changes, then run this setup again." >&2
    exit 1
  else
    git merge --ff-only "$base_ref"
  fi
elif git merge-base --is-ancestor "$base_ref" HEAD; then
  echo "This worktree already contains the latest $base_ref."
else
  echo "This worktree has diverged from $base_ref." >&2
  echo "Rebase or merge the worktree intentionally, then run this setup again." >&2
  exit 1
fi

echo "Syncing ignored local environment files from the primary checkout..."
bash scripts/sync-local-env.sh

echo "Installing Bun dependencies..."
bun install --frozen-lockfile

echo "Applying local D1 migrations..."
CI=1 bun run --cwd apps/web db:migrate:local

echo "Voyage worktree is ready."
