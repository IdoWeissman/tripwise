# Tripwise

**Plan group trips together — a shared itinerary, voting on ideas and fair expense splitting, all updating live.**

**[Live demo →](https://tripwise-v289.onrender.com/)** · click _Explore with the demo account_. The free host sleeps when idle, so the first load can take ~30–60 s.

![CI](https://github.com/IdoWeissman/tripwise/actions/workflows/ci.yml/badge.svg)

<!-- TODO: add a GIF of live voting here, plus a link to the live demo -->

## Features

- **Itinerary board**: activities grouped by day, drag to reorder
- **Proposals & voting**: ideas with enough votes are scheduled automatically
- **Shared expenses**: equal / percent / exact splits and a minimal "settle up" plan
- **Live updates** over GraphQL subscriptions
- **Roles**: owner, editor, viewer

## Tech stack

| Layer    | Tech                                                                              |
| -------- | --------------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, Apollo Client 4, React Router, Tailwind CSS 4         |
| API      | Node.js 22, Express 5, Apollo Server 5, graphql-ws, DataLoader, Zod               |
| Database | PostgreSQL 17, Prisma 7                                                           |
| Tooling  | pnpm workspaces, GraphQL Code Generator, Vitest, ESLint, Prettier, GitHub Actions |

## Project structure

```
apps/
  api/            Express + Apollo GraphQL server
    schema.graphql   ← API contract (source of truth)
    prisma/          data model, migrations, seed
    src/graphql/     resolvers, DataLoaders, PubSub, auth guards
  web/            React SPA
    src/styles.css   ← design tokens
docs/
  design-rules.md  UI rules every screen must follow
  decisions.md     architecture decision records
```

## Getting started

**Prerequisites:** Node.js 22+, pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install                      # installs deps, generates Prisma client + GraphQL types
cp .env.example apps/api/.env     # then set JWT_SECRET
pnpm db:up                        # start PostgreSQL in Docker
pnpm db:migrate --name init       # create the database schema
pnpm db:seed                      # demo data
pnpm dev                          # api → :4000, web → :5173
```

Open http://localhost:5173 and choose **Explore with the demo account**
(`demo@tripwise.app` / `tripwise-demo`). The GraphQL sandbox is at http://localhost:4000/graphql.

### Running against Neon

The app can use [Neon](https://neon.com) Postgres and Neon object storage instead of Docker.
`neon.ts` declares the services (a private `documents` bucket for booking files).

```bash
npm i -g neon@latest
neon deploy                       # provisions the services and writes .env.local in the repo root
pnpm --filter @tripwise/api exec prisma migrate deploy   # uses DATABASE_URL_UNPOOLED
pnpm db:seed
pnpm --filter @tripwise/api verify:neon                  # proves Postgres + storage work
pnpm dev
```

`apps/api` reads the repo-root `.env.local`, then `apps/api/.env`; real environment variables always win and missing files are skipped. Neon's `AWS_*` variables are
mapped to the app's `S3_*` settings automatically; `S3_BUCKET` defaults to `documents`. The app
uses the pooled `DATABASE_URL`, and migrations use `DATABASE_URL_UNPOOLED`.

### Smart booking import

Uploaded confirmations are read in layers, and you review everything before it's saved:

1. **schema.org data** that airlines and hotels embed in emails (exact).
2. **Calendar attachments** (`.ics` / `.vcs`) — one event per flight or reservation, with exact times.
3. **Text rules** — route titles ("Tel Aviv ⇄ Rome"), labelled totals, travellers, provider and manage-booking link.
4. **Claude (optional)** — set `ANTHROPIC_API_KEY` and the email, PDF (including scans) or ticket photo is also read by Claude through a strict tool schema. Exact calendar times always win, and anything the model leaves empty is filled from the rules. If the call fails, the rules' result is used. Uploaded content is sent to the Anthropic API only when a key is set.

## Deploy (Render + Neon, free tiers)

The API serves the built web app, so the whole thing is **one Render web service** (same origin: cookies and WebSockets just work). Config lives in [`render.yaml`](render.yaml).

1. **Neon:** run `neon deploy` (see above) to provision Postgres and the `documents` bucket; the values land in `.env.local`.
2. **Render:** _New → Blueprint_, pick this repo, fill in `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and the `AWS_*` storage variables from `.env.local`, then **Apply**.
3. Wait for the first deploy, then open the `*.onrender.com` URL and use **Explore with the demo account**.

On every start the service runs migrations and (with `SEED_DEMO=true`) resets the demo account's sample trip. The free instance sleeps after ~15 minutes idle; the first request then takes ~30–60 s.

## Scripts

| Command                                        | What it does                              |
| ---------------------------------------------- | ----------------------------------------- |
| `pnpm dev`                                     | Run API and web in watch mode             |
| `pnpm codegen`                                 | Regenerate types after editing the schema |
| `pnpm lint`                                    | ESLint across the monorepo                |
| `pnpm typecheck`                               | TypeScript in every package               |
| `pnpm test`                                    | Vitest in every package                   |
| `pnpm --filter @tripwise/api test:integration` | API flows against the seeded database     |
| `pnpm build`                                   | Production builds                         |
| `pnpm db:studio`                               | Browse the database in Prisma Studio      |

## AI coding agents

Tripwise ships a [graphify](https://github.com/Graphify-Labs/graphify) setup for Claude Code so the agent asks a
knowledge graph of the code ("what calls `reconcile`?") instead of grepping and reading whole files — far fewer
tokens per question. The graph is built locally from the source (tree-sitter, no API key, nothing leaves your machine)
and is gitignored, so each machine builds its own.

```bash
uv tool install graphifyy          # or: pipx install graphifyy  (Windows: winget install astral-sh.uv first)
graphify update .                  # build graphify-out/ (a few seconds)
graphify hook install              # optional: rebuild after every commit, checkout and merge
```

What's in the repo: the skill (`.claude/skills/graphify/`), Claude Code hooks that nudge the agent to query the graph
before raw reads (`.claude/settings.json`), and the rules in `CLAUDE.md`. Useful commands: `graphify query "…"`,
`graphify explain "BookingsPage"`, `graphify path "parseFile" "createBooking"`, and `graphify-out/graph.html` to browse.
The hooks only add a hint and never block a read. Without graphify installed, Claude Code shows a non-blocking "command not found" hook notice and works as before.

### Skills and sub-agents

Development workflows are packaged for Claude Code, so an agent can take a task from report to reviewed commit:

| Command / agent             | What it does                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/fix-bug <description>`    | Reproduce → failing test → fix the root cause → `pnpm verify` + browser QA → review → commit                                            |
| `/fix-ci [PR or error]`     | Run the CI steps locally in order (`.claude/skills/fix-ci/ci-local.sh`), fix the first failure, prove it green                          |
| `/new-screen <purpose>`     | API, route, data and every state for a new screen, its design-rules section, QA and review                                              |
| `/add-import-format <file>` | Compare what the importer reads with the file, add an invented fixture + failing test, fix the parser generally, keep personal data out |
| `reviewer` (sub-agent)      | Read-only review of the branch against `CLAUDE.md`, the design rules and known pitfalls                                                 |
| `qa` (sub-agent)            | Drives the running app at 390px and 1440px, tests the changed flows, looks at screenshots                                               |

Shared tooling the agents (and people) use: `pnpm verify` (format, lint, typecheck, tests), `pnpm qa:smoke` (browser
check of every main screen; first run `pnpm exec playwright install chromium`), and
`pnpm --filter @tripwise/api import:inspect <file> --text` (what the importer reads from an email, PDF or photo).
`.claude/settings.json` pre-approves these safe commands and blocks force-pushes and reading `.env` files; accept
Claude Code's workspace-trust prompt once for it to apply.

### Autonomous agent on GitHub

Two workflows run the same skills in GitHub Actions, so work happens without a laptop:

- **Issue → PR** (`agent-issue.yml`): add the label **`agent`** to an issue. Claude Code works on branch
  `agent/issue-<n>-<run>` with the project skills (`/fix-bug`, `/new-screen`, …) against a seeded Postgres, runs the
  checks and browser QA, and commits. The workflow then opens a PR that says `Fixes #<n>`, starts CI on it and comments
  on the issue. If the agent can't do it, it explains why on the issue instead.
- **Self-fixing CI** (`agent-ci-fix.yml`): when CI fails on an `agent/*` branch, Claude Code runs `/fix-ci` with the
  failed log and pushes a fix — at most 2 attempts, then the PR gets the `needs-human` label.

Guard rails: only people who can add labels can start it; the issue text reaches the agent as a file, never as shell
input; the agent can't push, can't use `gh` and must not touch `.github/` (the workflow publishes its work); a human
reviews and merges every PR.

**Setup (once):**

1. In Claude Code on your machine, run `claude setup-token` (uses your Claude Pro/Max subscription) and copy the token.
2. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**: `CLAUDE_CODE_OAUTH_TOKEN`.
3. GitHub → **Settings → Actions → General → Workflow permissions**: "Read and write permissions" and
   "Allow GitHub Actions to create and approve pull requests".
4. Create the label: `gh label create agent --color 5319E7 --description "Let the Claude agent work on this"`.

## Design

All UI follows [`docs/design-rules.md`](docs/design-rules.md). Architecture choices are explained in [`docs/decisions.md`](docs/decisions.md).

## License

MIT
