---
name: new-screen
description: Build a new Tripwise screen or dialog end to end — API (if needed), route, data, every state, design-rules section, browser QA and review. Use when the user asks for a new page, screen, dialog or view in the web app.
argument-hint: <what the screen is for>
---

# New screen: $ARGUMENTS

## 1. Pin down the screen

- Who uses it (owner / editor / viewer), what they need to see and do, and where it lives (route, nav entry, or a dialog opened from an existing screen). Ask the user only what you can't infer.
- Read `docs/design-rules.md` §1 (global rules) and the section of the most similar existing screen. If a design exists (the Tripwise design canvas), match it; otherwise copy the patterns of the closest screen.

## 2. API first (if the screen needs new data)

- Extend `apps/api/schema.graphql`, then `pnpm codegen`.
- Resolvers: authorise with `requireTripRole()` (viewer to read, editor to change, owner for admin); batch lookups with the DataLoaders; money as decimal strings; validate input with zod.
- Database changes: a migration that is safe on existing data (nullable or default).
- Publish a `TripEvent` when other members' screens should refresh.
- Tests: a unit test for logic and an integration test for permissions and the happy path.

## 3. The screen

- Route in `apps/web/src/App.tsx`; navigation in `components/TripLayout.tsx` if it's a section (max five mobile tabs — otherwise link it from an existing screen).
- Queries next to the page (`pages/<feature>/queries.ts`), using the generated types.
- Build with the shared components (`Button`, `Dialog`, `ConfirmDialog`, `Select`, `DateField`, `TimeField`, `PasswordInput`, `States`, `PageHeader`) and tokens from `styles.css` only.
- Every state: loading (skeletons), empty (with the next action), error (with retry), plus permission differences (viewers see no edit controls).
- 390px first: no horizontal scroll, touch targets ≥ 44px, labelled inputs, `aria-label` on icon buttons, one primary action per region.

## 4. Document it

Add a section for the screen under "2. Screen rules" in `docs/design-rules.md` (layout, actions, states, mobile) in the same change.

## 5. Verify

- `pnpm verify` passes (and the API integration tests when the API changed).
- Use the **qa** subagent: smoke test with `--path` for the new route, plus the new flows at 390px and 1440px.
- Use the **reviewer** subagent; fix every Blocker and Should-fix.
- `graphify update .`

## 6. Commit and report

Small conventional commits — API (`feat(api): …`), screen (`feat(web): …`), rules (`docs: …`). Report what was built, the QA verdict with a screenshot path, and anything deferred.
