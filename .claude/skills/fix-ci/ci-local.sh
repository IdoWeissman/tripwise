#!/usr/bin/env bash
# Runs the CI steps from .github/workflows/ci.yml locally, in order, and stops at the first failure.
# Usage: bash .claude/skills/fix-ci/ci-local.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
log_dir="qa-output/ci"
mkdir -p "$log_dir"

steps=(
  "install|pnpm install --frozen-lockfile"
  "format:check|pnpm format:check"
  "lint|pnpm lint"
  "typecheck|pnpm typecheck"
  "test|pnpm test"
  "build|pnpm build"
)

for entry in "${steps[@]}"; do
  name="${entry%%|*}"
  cmd="${entry#*|}"
  log="$log_dir/${name//:/-}.log"
  start=$(date +%s)
  if bash -c "$cmd" >"$log" 2>&1; then
    echo "✔ $name ($(( $(date +%s) - start ))s)"
  else
    echo "✘ $name failed — last 40 lines of $log:"
    tail -n 40 "$log"
    exit 1
  fi
done
echo "All CI steps pass locally."
