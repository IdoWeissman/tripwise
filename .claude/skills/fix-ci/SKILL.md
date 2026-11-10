---
name: fix-ci
description: Make the GitHub Actions CI pass — reproduce the exact CI steps locally, find the first failing step, fix the cause and prove it green. Use when the user says CI, a check or a PR build is failing, or pastes CI output.
argument-hint: "[PR number, run URL or pasted error]"
---

# Fix CI: $ARGUMENTS

## 1. See what failed

- If you have a PR or run: `gh pr checks <n>` and `gh run view <run-id> --log-failed` (when `gh` has access). Otherwise use the error the user pasted.
- Read `.github/workflows/ci.yml` — CI runs, in order: `pnpm install --frozen-lockfile` (also runs Prisma generate and GraphQL codegen), `format:check`, `lint`, `typecheck`, `test`, `build`.

## 2. Reproduce locally, in CI order

Run `bash ${CLAUDE_SKILL_DIR}/ci-local.sh`. It runs the same steps from a clean install and stops at the first failure, printing that step's last lines. Reproduce before changing anything.

## 3. Fix the cause

Common causes in this repo:

- **format:check fails on files you didn't write** (vendored skills, generated output): add the folder to `.prettierignore` rather than reformatting vendor files.
- **Lockfile out of date** (`--frozen-lockfile` error): run `pnpm install` and commit `pnpm-lock.yaml`.
- **Types missing for a new query** ("has no exported member", "Expecting a parsed GraphQL document"): run `pnpm codegen`; never edit generated files.
- **Test depends on order or on leftover data**: make it restore what it changes.
- **Only fails in CI**: differences in Node version (`.nvmrc`), env vars, time zone or a case-sensitive path.

Never weaken a check to make it pass (no skipped tests, no `eslint-disable` without a reason, no lowered thresholds) unless the user agrees.

## 4. Prove it

Run `bash ${CLAUDE_SKILL_DIR}/ci-local.sh` again until every step passes. Then use the **reviewer** subagent if you changed app code. Commit as `fix(ci): …` or `chore: …` with the cause in the body.

## 5. Report

The failing step, the cause, the fix, and the passing local run. If the failure can't be reproduced locally, say what differs and what you'd check next in CI.
