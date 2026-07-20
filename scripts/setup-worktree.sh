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

required_env_files=(
  "apps/web/.env.local"
  "apps/web/.dev.vars"
)

common_git_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
primary_checkout="$(dirname "$common_git_dir")"

if [[ "$repo_root" != "$primary_checkout" ]]; then
  for env_file in "${required_env_files[@]}"; do
    primary_env_file="$primary_checkout/$env_file"

    if [[ ! -s "$env_file" && -s "$primary_env_file" ]]; then
      echo "Copying local environment file from primary checkout: $env_file"
      mkdir -p "$(dirname "$env_file")"
      install -m 600 "$primary_env_file" "$env_file"
    fi
  done
fi

missing_env=false
for env_file in "${required_env_files[@]}"; do
  if [[ ! -s "$env_file" ]]; then
    echo "Missing required local environment file: $env_file" >&2
    missing_env=true
  fi
done

if [[ "$missing_env" == "true" ]]; then
  echo "Add the files to the primary checkout so setup can copy them into new worktrees." >&2
  exit 1
fi

echo "Installing Bun dependencies..."
bun install --frozen-lockfile

echo "Applying local D1 migrations..."
CI=1 bun run --cwd apps/web db:migrate:local

echo "Voyage worktree is ready."
