# Booking importer evals

`cases.ts` holds **invented** confirmations with their right answers; CI runs them rules-only and fails
on any regression (`eval:import --check`). They are safe to commit, but they were written by the same
people who wrote the parser, so they flatter it.

## Private cases: your real files

Real confirmations show how the importer does on documents nobody tuned for. They contain personal
data, so they live in `private/`, which git ignores and which is never committed.

```
apps/api/evals/importer/private/
  .gitignore        # "*" — belt and braces, in case the root .gitignore changes
  cases.json        # the right answers
  e-ticket.pdf      # the files themselves (.pdf, .eml or .txt)
  voucher.pdf
```

`cases.json` lists one entry per file, with the fields you want scored (same names as in `cases.ts`;
`"price": null` means "the document states no price"):

```json
[
  {
    "id": "airline-eticket",
    "file": "e-ticket.pdf",
    "expect": [{ "type": "FLIGHT", "title": "Tel Aviv ⇄ Rome", "legs": ["XQ 381", "XQ 382"] }]
  }
]
```

Run it rules-only and AI-first, and compare:

```bash
pnpm --filter @tripwise/api eval:import --private          # rules only
pnpm --filter @tripwise/api eval:import --private --ai     # AI first (needs ANTHROPIC_API_KEY)
```

The AI report also lists which fields were flagged **Check this** — a good importer flags the fields
it got wrong, so wrong-but-unflagged values are the ones to look at first. Reports are written to
`private/report*.md`.
