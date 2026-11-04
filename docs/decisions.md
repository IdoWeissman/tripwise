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

## 008 — Stateless invite links

Invites are signed JWTs (`typ: "invite"`, trip, role, inviter, 7-day expiry), so no table or migration is needed and links can be shared anywhere. Session verification rejects invite tokens and vice-versa. Trade-off: a link can't be revoked before it expires. When email invites land, add an `Invite` table with a revocable id.

## 009 — Money math in integer cents

Splits, balances and settle-up run in integer cents (`apps/api/src/lib/money.ts`). Equal and percent splits use largest-remainder rounding so shares always add up to the exact total, and balances always sum to zero. Settle-up uses the greedy "largest debtor pays largest creditor" heuristic (≤ n−1 payments).

## 010 — Live updates via lightweight events

Subscriptions publish small `TripEvent`s (kind, activityId, actorId) instead of full payloads. Clients refetch whatever is on screen (debounced) and skip events they caused, which keeps the cache logic trivial and authorization in one place.

## 011 — One service in production

The Express API serves the built React app (`WEB_DIST`). Separate `*.onrender.com` services would be different sites, so browsers would block the session cookie and complicate WebSockets. One origin keeps auth and live updates simple; static assets are served with long-lived immutable caching and client routes fall back to `index.html`.
