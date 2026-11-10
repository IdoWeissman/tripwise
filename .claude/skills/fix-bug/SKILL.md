---
name: fix-bug
description: Fix a Tripwise bug end to end — reproduce it, write a failing test, fix the root cause, verify with the full checks and a browser run, get a review, and commit. Use when the user reports a bug, an error message, wrong behaviour or a GitHub issue.
argument-hint: <bug description, error message or issue URL>
---

# Fix a bug: $ARGUMENTS

Work through these steps in order. Don't skip the failing test — it's what proves the fix.

## 1. Understand it

- Restate the bug in one sentence: what the user did, what happened, what should happen.
- If it's an issue URL, read it with `gh issue view <n>` (or ask the user to paste it if `gh` has no access).
- Locate the code: `graphify query "<the symptom>"` and `graphify explain "<suspect symbol>"` when `graphify-out/graph.json` exists, then read only the relevant lines.

## 2. Reproduce it

Pick the cheapest reproduction that shows the bug:

- **Pure logic** (parsers, money, time, formatting): a unit test in `apps/api/test/*.test.ts` or `apps/web/src/**/*.test.ts`.
- **API behaviour** (permissions, resolvers, uploads): an integration test in `apps/api/test/*.integration.test.ts` (needs the seeded DB: `pnpm db:seed`, then `pnpm --filter @tripwise/api test:integration`). Leave seeded data as you found it.
- **UI**: a Playwright script in `qa-output/` using `scripts/qa-lib.mjs` (`launch()` shows scrollbars, `signIn`, `scrollGlitches`), or `pnpm qa:smoke --path <route>`. Assert on measured values (element sizes, `scrollHeight` vs `clientHeight`, `scrollGlitches(page)`), not on how a screenshot looks — headless browsers hide scrollbars unless launched with `launch()`.

Run it and confirm it **fails for the reported reason**. Reproduce in the exact state the report describes (open the dialog, use the stated viewport, add the data). If you still can't reproduce it, stop and write down what you tried, what you measured and what you need (steps, screenshot, data) — never end without either a fix or that explanation.

## 3. Fix the root cause

- Fix the cause, not the symptom — explain the cause in one or two sentences before editing.
- Keep the change small and follow `CLAUDE.md` (and `docs/design-rules.md` for UI). If `schema.graphql` changes, run `pnpm codegen`.
- Check for the same bug elsewhere (same pattern in sibling files) and fix those too, or list them.

## 4. Verify

- The reproduction test now passes.
- `pnpm verify` (format, lint, typecheck, unit tests) passes. Run `pnpm --filter @tripwise/api test:integration` too when API code changed and a database is available.
- For UI changes, use the **qa** subagent on the affected screens (phone and desktop).
- Run `graphify update .` so the code graph reflects the change.

## 5. Review and commit

- Use the **reviewer** subagent on the branch; fix every Blocker and Should-fix it reports, then re-run `pnpm verify`.
- Commit as `fix(<area>): <what was wrong, in user terms>`, with a body that states the root cause and how the test covers it.
- Never commit real personal data (names, emails, booking codes, private links) — invent fixture values.

## 6. Report back

Two or three sentences: the cause, the fix, and the evidence (failing → passing test, checks, QA verdict). Mention anything left open.
