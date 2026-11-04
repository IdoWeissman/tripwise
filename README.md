# Tripwise

**Plan group trips together — a shared itinerary, voting on ideas and fair expense splitting, all updating live.**

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

`apps/api` loads `.env` and then `../../.env.local` (later wins). Neon's `AWS_*` variables are
mapped to the app's `S3_*` settings automatically; `S3_BUCKET` defaults to `documents`. The app
uses the pooled `DATABASE_URL`, and migrations use `DATABASE_URL_UNPOOLED`.

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

## Design

All UI follows [`docs/design-rules.md`](docs/design-rules.md). Architecture choices are explained in [`docs/decisions.md`](docs/decisions.md).

## License

MIT
