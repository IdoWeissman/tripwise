# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: groups of friends or family planning and taking a trip together.** Several people share one trip: someone owns it, others edit or just view. They use Tripwise twice over:

- **Before the trip**, mostly on desktop: collecting bookings, proposing and voting on ideas, shaping the day-by-day plan.
- **During the trip**, on a phone, often one-handed and in a hurry: checking what's next, finding a booking code or address, adding an expense right after paying, seeing who owes whom.

**Secondary: portfolio reviewers** (hiring managers, engineers) who arrive from the README or live demo, enter through *Explore with the demo account*, and judge the product and engineering craft within a few minutes. Real groups come first; the demo path must always stay obvious and work.

## Product Purpose

Tripwise replaces the mix of group chat, shared docs, spreadsheets and a separate expense app with one shared trip that everyone sees update live. It holds the itinerary, the group's ideas and votes, the bookings, and the shared money.

Success means a group decides together without endless chat threads, everyone finds trip details without asking, and nobody argues about money at the end.

## Positioning

**All-in-one, live, and built around group decisions.** Itinerary, proposals and voting, bookings and expenses live in one trip that every member sees change in real time. Group decisions have mechanics: ideas with enough votes are scheduled automatically, and expenses settle with a minimal set of payments. The AI layer (booking import, trip assistant, MCP server) reinforces this core rather than leading it.

## Operating Context

- Roles: owner, editor, viewer. Members join through invite links.
- Trip sections: overview, itinerary (activities by day, drag to reorder), proposals and voting, bookings (imported from confirmation emails, PDFs, calendar files or pasted text, always reviewed before saving), expenses (equal, percent and exact splits; settle-up plan), members.
- Trip assistant: an *Ask* panel on every trip screen answers from the trip's data and uploaded documents with numbered citations, and can suggest an expense, activity or booking that is saved only after the user confirms.
- MCP: users create a personal token under *AI assistants* to let Claude, Cursor or another MCP client read and add to their trips.
- Live updates over GraphQL subscriptions; a "Live" indicator shows connection state.

## Capabilities and Constraints

- Money is exact (decimal, integer-cent math); balances always sum to zero and are always shown signed.
- Every write by AI goes through the same role checks as the app and needs a user confirmation.
- Booking documents and assistant questions may be in **Hebrew** while the UI is in English; Hebrew content must display and be searchable correctly.
- **Full Hebrew / right-to-left UI is a committed future requirement.** New work should not block it (use logical layout properties, avoid direction-dependent assumptions). Not yet built.
- **Phone use during the trip is a primary context**, not a scaled-down afterthought: fast access to next items, codes and adding expenses.
- The public demo runs on a free host that sleeps when idle; the first load can take 30–60 s. The assistant has daily caps per user and per site.
- `docs/design-rules.md` is the binding rulebook for every screen (tokens, states, accessibility, formatting); `apps/web/src/styles.css` holds the tokens.

## Brand Commitments

- Name: **Tripwise**, with an existing logo component (`apps/web/src/components/Logo.tsx`).
- Copy is sentence case; buttons are verbs ("Add expense", "Submit for a vote").
- The visual system in `docs/design-rules.md` and the Tripwise design canvas (screens 01–06 desktop, M1–M4 mobile) is the incumbent reference.

## Evidence on Hand

- Live demo with a seeded demo account (`demo@tripwise.app`), linked from the README.
- Importer evals: seen formats 100%, unseen formats 81% (rules only), enforced in CI against a baseline.
- Assistant retrieval eval: keyword-only 67% hit@5, 100% on exact codes and names.
- No real users, testimonials, usage numbers or press exist. Do not invent any.

## Product Principles

1. **The group decides, the app keeps score.** Make shared decisions (votes, splits, schedules) visible and fair, never hidden in one person's head.
2. **Everyone sees the same trip, now.** Live state is the default; nothing should require a refresh or a "did you see my message?".
3. **Find it in seconds on a phone.** During the trip, the next thing, a booking code or "add expense" is always a short reach away.
4. **Trust before automation.** Imports and AI suggestions are reviewed and confirmed by a person; money is exact and explainable.
5. **Show real craft to anyone who looks.** The demo path works instantly and every screen holds up to close inspection.

## Accessibility & Inclusion

- WCAG AA as set in `docs/design-rules.md`: text contrast ≥ 4.5:1, touch targets ≥ 44px, real interactive elements, color never the only signal, works at 390px width.
- Mixed-language content (Hebrew and English) must render with correct direction per text run; a full RTL interface is a future requirement.
