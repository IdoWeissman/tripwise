# Architecture decisions

Short records of _why_ things are the way they are.

## 001 — GraphQL over REST

The UI is deeply nested (trip → days → activities → votes/creators) and needs live updates. GraphQL lets each screen fetch exactly its shape in one request, and subscriptions give a typed real-time channel. N+1 risk is handled with DataLoader.

## 002 — Schema-first + code generation

`apps/api/schema.graphql` is the contract. GraphQL Code Generator produces resolver types for the server (mapped to Prisma models) and typed documents for the client, so a schema change breaks the build in both apps instead of at runtime.

## 003 — Prisma 7 with the `pg` driver adapter

Type-safe queries, readable schema and migrations. Prisma 7's TypeScript query compiler + `@prisma/adapter-pg` means no native query engine binary in production.

## 004 — Money as `NUMERIC`, strings on the wire

Floating point can't represent currency exactly. Amounts are `NUMERIC(12,2)` in Postgres and decimal strings in GraphQL. Expense splits are written in the same transaction as the expense; balances must always sum to zero.

## 005 — Session in an httpOnly cookie

A signed JWT in an `httpOnly`, `SameSite=Lax` cookie keeps tokens out of JavaScript (XSS-safe) and is sent automatically on the WebSocket upgrade, so HTTP and subscriptions share one auth path. In development Vite proxies `/graphql` so everything is same-origin. _Next:_ short-lived access token + rotating refresh token.

## 006 — In-memory PubSub (for now)

Fine for a single API instance. When scaling horizontally, replace with Redis (`graphql-redis-subscriptions`) or Postgres `LISTEN/NOTIFY` — the `publishTripEvent()` helper is the only call site to change.

## 007 — Tailwind CSS v4 with design tokens

Tokens from `docs/design-rules.md` live in `@theme` in `apps/web/src/styles.css`, so utilities like `bg-accent` or `text-ink-muted` are the only way to apply color. This keeps the UI consistent with the rules.
