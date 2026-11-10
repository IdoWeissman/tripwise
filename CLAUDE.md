# Tripwise — instructions for AI coding agents

Read this before making any change.

## Design rules are mandatory

- **Every** UI change, new screen or new feature must follow [`docs/design-rules.md`](docs/design-rules.md). Read it before touching anything in `apps/web`.
- Use only the design tokens defined in `apps/web/src/styles.css` (they mirror §1.1 of the rules). Never introduce stray hex values, font sizes or radii. If a new token is truly needed, add it to **both** the rules file and `styles.css` first.
- New screen? Add a section for it under "2. Screen rules" in `docs/design-rules.md` in the same change.
- Every screen ships with loading, empty and error states, works at 390px width, keeps touch targets ≥ 44px and text contrast ≥ 4.5:1.
- The visual reference is the Tripwise design canvas (screens 01–06 desktop, M1–M4 mobile). Match it.

## Architecture

- pnpm monorepo: `apps/api` (Express 5 + Apollo Server 5 + graphql-ws + Prisma 7/PostgreSQL) and `apps/web` (React 19 + Vite + Apollo Client 4 + Tailwind CSS 4).
- `apps/api/schema.graphql` is the single source of truth for the API. After editing it run `pnpm codegen`; server resolver types and client types are generated (never edit generated files).
- Money is stored as `NUMERIC(12,2)` (Prisma `Decimal`) and sent over GraphQL as decimal strings — never floats.
- Authorization goes through `requireTripRole()` in `apps/api/src/graphql/errors.ts`.
- Batch per-request lookups with the DataLoaders in `apps/api/src/graphql/loaders.ts` (no N+1 queries).

## Before you finish

Run `pnpm lint && pnpm typecheck && pnpm test` (or `pnpm verify`). If you touched the booking importer (`apps/api/src/bookings/parse/`), also run `pnpm --filter @tripwise/api eval:import --check`, and `--update` the baseline when scores improved. Keep commits small and conventional (`feat:`, `fix:`, `docs:`, `chore:`).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- graphify-out/ is gitignored: each machine builds its own graph. If it's missing, run `graphify update .` (code only, a few seconds, no API calls). Setup: see "AI coding agents" in README.md.
