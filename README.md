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

## Scripts

| Command          | What it does                              |
| ---------------- | ----------------------------------------- |
| `pnpm dev`       | Run API and web in watch mode             |
| `pnpm codegen`   | Regenerate types after editing the schema |
| `pnpm lint`      | ESLint across the monorepo                |
| `pnpm typecheck` | TypeScript in every package               |
| `pnpm test`      | Vitest in every package                   |
| `pnpm build`     | Production builds                         |
| `pnpm db:studio` | Browse the database in Prisma Studio      |

## Design

All UI follows [`docs/design-rules.md`](docs/design-rules.md). Architecture choices are explained in [`docs/decisions.md`](docs/decisions.md).

## License

MIT
