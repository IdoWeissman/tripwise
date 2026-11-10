---
name: add-import-format
description: Teach the booking importer a new confirmation format (email, PDF or pasted text) that it reads wrongly — compare what it extracts with what the file says, add an invented fixture and a failing test, fix the parser generally, and keep the user's personal data out of the repo. Use when the user shares a booking email/PDF that imported with a wrong title, dates, price, code or place.
argument-hint: <path to the .eml / .pdf / text file> [what looks wrong]
---

# Teach the importer: $ARGUMENTS

The importer lives in `apps/api/src/bookings/parse/`: `index.ts` (pipeline: schema.org → calendar attachments → text rules → optional Claude), `calendar.ts`, `text.ts` (labels, dates incl. Hebrew, prices, places), `title.ts`, `ai.ts`. Tests: `apps/api/test/import.test.ts` and `parse.test.ts`; fixtures in `apps/api/test/fixtures/emails.ts`.

## 1. See what it reads today

```
pnpm --filter @tripwise/api import:inspect "<file>" --text
```

Make a table — **field · what the file says · what we extract** — for type, title, provider, confirmation code, start/end (local time), place/address, travellers, price + currency, booking link, legs. Expected values: a compact title (route "Tel Aviv ⇄ Rome", hotel or venue name, product name — never the email subject), the total paid, local wall-clock times.

## 2. Privacy first

The file is the user's real booking. **Never** commit it or copy its real values (names, emails, booking/ticket numbers, addresses, phone numbers, private links, prices tied to a person) into fixtures, tests, comments or commit messages. Don't paste them into chat beyond what's needed.

## 3. Invented fixture + failing test

- Add a fixture to `test/fixtures/emails.ts` that reproduces the **structure** of the real file — language, label wording, line layout, forwarded headers, attachments (e.g. `.ics`), the tricky parts — with invented values.
- Add a test in `test/import.test.ts` asserting every field from the table. Run `pnpm --filter @tripwise/api test` and confirm it fails for the right reasons.

## 4. Fix the parser — generally

- Prefer structure over vendor names: labelled values (`labelValue`), calendar attachments, product line next to a reference, Maps-linked addresses, time ranges and durations. Never hard-code one sender.
- Add new label words in both English and the file's language (e.g. Hebrew) to the existing regexes.
- Keep the layers' order: exact data (schema.org, calendar) beats text rules; the AI result is validated and reconciled, never trusted blindly.

## 5. Prove it and check for regressions

- `pnpm --filter @tripwise/api test` — the new test and **all** existing import tests pass.
- Re-run `import:inspect` on the real file: every field from the table is now right.
- If the user has other sample files available, re-run them too.
- `pnpm verify`.

## 6. Leak check, review, commit

- Scan the diff for the real file's values: `git diff | grep -n -i -E "<real code>|<real surname>|<real email>|<real street>"` — must print nothing.
- Use the **reviewer** subagent.
- Commit as `feat(api): read <kind> confirmations: <what's new>` and report the before/after table (with the user's real values only in chat, not in the repo).
