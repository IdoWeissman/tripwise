# Tripwise — Design Rules

> Rules that must hold on **every** screen. Treat a violation as a bug.
> Location in repo: `docs/design-rules.md`. Read this before building or changing any UI (humans and AI coding agents alike).

Status: **draft v0.1** — screens covered: Sign in, Trips dashboard, Itinerary, Proposals, Expenses, Members, Mobile (Itinerary, Proposals, Expenses, Add expense).

---

## 1. Global rules (apply to all screens)

The visual world is **Platform**: the trip runs like a well-run station. Enamel sign blue carries the navigation and the boards, signal yellow marks only _now / next / you-are-here_, white sign panels sit on a cool grey ground, and every plan reads like a timetable line.

### 1.1 Design tokens — never hard-code outside the token file

| Token                                                        | Value                                         | Use                                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `color.bg`                                                   | `#F2F4F8`                                     | App ground                                                                                             |
| `color.surface`                                              | `#FFFFFF`                                     | Panels, cards, dialogs, bottom tab bar                                                                 |
| `color.surface-muted` / `surface-column`                     | `#E9EDF3` / `#EDF0F5`                         | Segmented tracks, neutral chips / itinerary day columns                                                |
| `color.border` / `border-input`                              | `#DCE1EA` / `#C3CAD6`                         | Hairlines and panel edges / inputs, hovered secondary buttons                                          |
| `color.ink` / `ink-secondary`                                | `#111418` / `#3A4150`                         | Primary text / body copy                                                                               |
| `color.ink-muted`                                            | `#5A6272`                                     | Meta text, captions — the lightest text allowed                                                        |
| `color.sign`                                                 | `#0B2A6F`                                     | The sign: rail, phone header, departure board, primary buttons, trip plates                            |
| `color.sign-raised`                                          | `#163C8C`                                     | Active rail item, buttons on the sign, primary hover                                                   |
| `color.sign-ink-soft`                                        | `#B9C6E4`                                     | Secondary text on the sign (7.8:1)                                                                     |
| `color.signal`                                               | `#FFC917`                                     | **Rationed**: you-are-here bars, the next departure time, the Next pill, Today / Happening now markers |
| `color.signal-tint` / `signal-ink`                           | `#FFF1C2` / `#7A5300`                         | Reminder strip, Next/Today pill tints                                                                  |
| `color.accent` (Plan blue)                                   | `#1F5FD1`                                     | Links, focus rings, interactive controls, Itinerary/Bookings section hue                               |
| `color.accent-strong` / `accent-deep`                        | `#163C8C` / `#0B2A6F`                         | Accent text on tints                                                                                   |
| `color.accent-tint` / `accent-tint-border`                   | `#E3ECFF` / `#C3D4FA`                         | Every booking type chip, highlights, disabled primary                                                  |
| `color.vote` / `vote-tint`                                   | `#6B3FD4` / `#EEE6FF`                         | Proposals section hue: Vote buttons, submit, open-ideas count                                          |
| `color.money` / `money-tint`                                 | `#0B7A54` / `#E1F4EA`                         | Expenses section hue: balance panel, positive balances, "you" settle rows                              |
| `color.rail-plan` / `rail-book` / `rail-vote` / `rail-money` | `#5B8CF0` / `#7FD0F0` / `#B49CF5` / `#5FD3A3` | Section marks on the blue rail only                                                                    |
| `color.live`                                                 | `#3DDC97`                                     | "Live" connection dot only — never text                                                                |
| `color.negative` / `negative-ink`                            | `#D23A1E` / `#B8311A`                         | Money owed (bars / text and owed panels), destructive actions, alert dots                              |
| `color.attention` / `attention-ink`                          | `#FDE2DA` / `#9E2A12`                         | Missing-details alerts                                                                                 |
| `color.tint-orange`                                          | `#FDEEE6`                                     | Missing-details alert wash (with `attention` border)                                                   |

- **Section hues**: each section owns one hue at full strength on its sign — Today yellow, Plan blue (Itinerary, Bookings), Vote violet (Proposals), Money green (Expenses). A section's hue never decorates another section.
- **Yellow is rationed** to now / next / you-are-here and counts that need you. If it spreads further the screen turns into a construction site.
- Owed vs owed-to-you differ in **hue and sign** (green `+` vs red `−`), never colour alone.
- Member avatar palette is fixed: Green `#D3F0E3/#0B6446`, Red `#FDE2DA/#9E2A12`, Blue `#DCE6FC/#163C8C`, Violet `#EEE6FF/#5230A8`, Amber `#FFF1C2/#7A5300`. A member keeps the same colour on every screen (assigned by join order).

### 1.2 Typography

- One family: **Archivo** (variable, weight 400–800 and width 62–125%), fallback `system-ui` (which also covers Hebrew).
- Scale: 12 (labels) · 13 (meta) · 14–15 (body/UI) · 16–18 (row and panel titles) · then the display tokens, used as `text-*` utilities: `timetable` 22 · `headline-sm` 26 (phone H1, board route, Leave by) · `headline` 34 (desktop H1) · `count` 36 · `board-sm` 44 (phone board time, balance) · `display` 48 · `board` 56. No other display sizes.
- Headings weight 800 with `letter-spacing: -0.02em` at 22px+. Body 400–500, UI labels 700.
- **Times, amounts, counts and codes** use the `figures` utility: tabular numerals at width 82%, so columns line up like a printed timetable. Importance is a size ramp: times and amounts big, labels small.
- Confirmation codes on the board sit on a white plate in monospace with 0.1em tracking (codes are data).
- Minimum text size **12px**; 11px only for avatar initials.

### 1.3 Spacing, radius, elevation

- **8px modular grid**: 8 / 16 / 24 / 32 / 40 / 48 (4 only inside dense controls).
- Radius: 4 (`chip`) · 8 (`control`: buttons, inputs, nav items) · 12 (`card`: panels, boards, dialogs) · 999 (avatars, pills, dots).
- Elevation is **colour fields and hairlines, not shadows**. Shadows only for the selected segment, an item being dragged and popovers (`shadow-segment` / `shadow-lifted` / `shadow-popover`).
- **State is never colour alone**: confirmed bookings are solid chips, plans nobody has booked are dashed, things already done today are struck through and muted.
- No gradients, no glass, no coloured side-stripes on cards, no emoji in UI.

### 1.4 Layout

- Trip screens share one shell (`TripLayout`).
  - **Desktop (`lg`+)**: a 248px **sign rail** (sticky, full height, `color.sign`) holding the logo, the trip name and dates, the section nav (hue mark + label + white count badge; the active item is `sign-raised` with the 5px yellow **you-are-here bar** at the rail's edge), then at the bottom the **Ask** button, member avatars, Live indicator, "My trips" and Invite (owners). Content sits to the right, max 1200px, 40px side padding; there is no top bar.
  - **Phones and tablets (< `lg`)**: a one-row **sign header** — logo plate, trip name + dates (truncate), Live dot, **Ask**, People button — and the fixed white **bottom tab bar** (Today · Plan · Bookings · Vote · Money); the active tab is `sign` weight 700 with a 4px yellow bar along its top edge. Below 360px Ask is icon-only; below `sm` the Live label is screen-reader only. Never show both navigations at once.
- The account pages (`AppLayout`: trips, AI assistants) use the same sign blue for their header, always one row: below `sm` "AI assistants" becomes an icon button (name kept for screen readers) and the avatar hides.
- Wide tables live inside an `overflow-x: auto` box; toolbars and button groups wrap.
- Mobile reference 390×844, 16px side gutters.

### 1.5 Components

- **Primary button**: `sign` background, white text, weight 700, 44px tall (48–52 for mobile primary actions); hover `sign-raised`. Max **one** primary per region. Disabled: `accent-tint-border` with `accent-deep` text (stays readable).
- **Section primary**: on Proposals the primary (Submit for a vote) and the Vote / Voted buttons wear Vote violet (`Button variant="vote"`; unvoted = violet outline, voted = solid violet).
- **Secondary button**: white, 1.5px `border`, ink text; hover darkens the edge to `border-input`.
- **Destructive**: `negative-ink` text, stands alone with clear space around it — never next to the primary — and always confirms.
- **Departure board** (Today's Up next): `sign` panel; a header strip with the type on the left and the countdown in yellow on the right; the row is time (yellow, `figures`, 44/56px) · route (22/30px white) · code plate · **Leave by** (flights: 2 h 30 min before departure, the server's reminder rule); a footer strip of white text links (on phones: "Directions", "Manage"). The row turns over with `animate-flap-in` when the next departure changes.
- **Timetable rows**: big `figures` time (22px) · type chip · title + meta, separated by hairlines inside one white panel. The next timed row lifts (time in `accent-strong` + a yellow **Next** pill); done rows are muted and struck. Never a stack of separate cards.
- **Booking rows** (Bookings): the same timetable logic — see §2 · 08.
- **Type chips** (`BOOKING_TYPES`): every booked thing wears the same solid Plan-blue chip (`accent-tint` / `accent-strong`) and its 3–5 letter code (FLT, STAY, SHOW, SIGHT, TOUR, RAIL, FOOD, MISC) names the type; a plan nobody has booked is a dashed outline "PLAN". Section hues (Vote violet, Money green) never colour a booking.
- **Segmented control / tabs**: muted track, 44px segments, selected segment white with `shadow-segment`; correct `tablist`/`radiogroup` roles.
- **Filter pills**: active pill is `sign` with white text.
- **Avatar**: circle, initial, member palette, 2px ring in the colour behind the stack (`ringClassName`, e.g. `border-sign` on the rail). Title with full name.
- **Live indicator**: lives on the sign only — `live` dot + white "Live"; `sign-ink-soft` dot + "Reconnecting…" otherwise. Never an "N online" count.
- **Count badge**: white pill with `sign` text, `figures`, min 22px (it sits on the rail). On the phone tab bar a 10px `negative` dot with a white ring stands in for it.
- **Never use native `<select>`, `type="date"` or `type="time"` inputs** — use the shared components:
  - **Select** (`components/Select.tsx`, Radix): field-styled trigger (44px, or 40px `sm`), 16px chevron flipping when open; menu = surface, `rounded-card`, `border`, `shadow-popover`, 6px gap, at least trigger width; 40px items, highlight `surface-muted`, selected item `accent-strong` bold with a check. Full keyboard support.
  - **Date field** (`components/DateField.tsx`): "Fri, Nov 20, 2026" trigger with a calendar icon; 44px day cells, selected day = `sign` fill, today bold + underline, days before `min` disabled; Clear / Today footer.
  - **Time field** (`components/TimeField.tsx`): Select of 24h times in 15-minute steps plus "Any time".
  - Menus inside a dialog render inside that dialog (`PortalContainerContext`).
- **Dialog**: native `<dialog>`; full-screen sheet on phones, centred `rounded-card` (440px, or 560px for forms with lists) from `sm` up, as tall as its content up to 90vh with sticky footers; title + 44px close button.
- **Password field** (`components/PasswordInput.tsx`): show/hide eye button inside the right edge (44px, `aria-label`, `aria-pressed`), never submits.
- **Confirm dialog**: every destructive action asks first; confirm uses `negative` colours.
- **Toast**: bottom-centre, `sign` (or `negative-ink` for errors) with white text, auto-dismiss after 4s, `role="status"`/`alert`; above the bottom tab bar on phones.

### 1.6 Accessibility (non-negotiable)

- Touch/click targets **≥ 44×44px**.
- Text contrast **≥ 4.5:1** (3:1 only for 24px+). `ink-muted` `#5A6272` on `bg` `#F2F4F8` (5.6:1) is the lightest text allowed; on the sign use `sign-ink-soft` or white, on colour panels white or white/90.
- Real elements only: `<button>`, `<a href>`, `<input>` with a `<label>`. Never click handlers on `div`/`span`.
- Icon-only buttons have `aria-label`. Decorative SVGs have `aria-hidden="true"`.
- Current nav item has `aria-current="page"`; toggles use `aria-pressed`; progress uses `role="progressbar"` with values.
- Color is never the only signal (e.g. balances also show `+`/`−` signs and text).

### 1.7 Content & data formatting

- Money: currency symbol + 2 decimals (`€1,280.00`); balances always signed (`+€42.10`, `−€64.20`); use the real minus sign `−`.
- Dates: `May 14 – 19` (en dash, no year unless not the current year); days as `Day 2 · Sat, May 15`.
- Times: 24h `18:30`.
- Relative times for activity: `2m ago`, `1h ago`, `Yesterday`, then a date.
- Copy is sentence case. Buttons are verbs ("Add expense", "Submit for a vote").

### 1.8 States every screen must design

- **Loading**: skeletons in the shape of the final content (no full-page spinners).
- **Refetches are silent**: skeletons appear only before the first response. Background refreshes (live events, refetch after a mutation) update content in place and never swap it for a skeleton.
- **Empty**: dashed-border block with a one-line explanation + the next action.
- **Error**: inline message near the failed element + retry; never lose user input.
- **Optimistic updates**: votes, reorders and new expenses appear instantly and roll back with a toast on failure.
- **Live updates** (GraphQL subscriptions): incoming changes animate in subtly (≤200ms fade/slide); never move the item the user is currently interacting with.
- **Motion tokens**: `animate-seat-in` (200ms, scale 0.6 → 1 with fade) — a voter's face settling into its seat; `animate-flap-in` (320ms, a short split-flap turn) — the departure board row changing. Motion is short and mechanical, never bouncy. Always behind `motion-safe:`; the base layer also collapses all motion under `prefers-reduced-motion`.
- **Browser surfaces**: text selection is `signal` with `sign` text; the caret is `accent`; scrollbars use `border-input` on transparent. Trip screens start with a "Skip to content" link (visible on focus) that jumps to `main`.

---

## 2. Screen rules

### 01 · Sign in

- Split layout: brand/value panel on the sign (`sign` field, white 52px headline, yellow check plates, logo plate) + white form panel. Panels stack on mobile (form first).
- Max form width 400px. Order: Email → Password → Sign in → divider → **Explore with the demo account** → Create account link. ("Forgot password?" is added together with the reset flow.)
- **Sign up** (`/sign-up`) reuses this layout with a Name field first and the heading "Create your account".
- Both honour `?next=` (in-app paths only) so an invite link returns the user to the join screen.
- The demo-account entry must always be visible (portfolio visitors).
- Validation errors appear under the field, on blur and on submit.

### 02 · Trips dashboard

- Page title "Your trips" + summary line + one primary "New trip" button.
- Upcoming / Past filter as a segmented control.
- Trip cards in an auto-fill grid (min 300px). Every card shows: status pill, countdown, name, place · dates, member avatars, one stat line. The whole card is a single link.
- Card cover is a **trip plate** in `sign`, `sign-raised` or `money` (cycled) with white type — no stock photos unless the user uploads one. The plate carries the trip: the destination (first part, 28px extrabold) and a **day strip** (one tick per trip day; days already lived are yellow, the rest white at 30%) with "N days". The "Happening now" pill is yellow; other status pills are white at 15%.
- The last grid cell is always the dashed "Plan a new trip" card.
- Card status pill: Upcoming / Happening now / Past; countdown "in N days" on upcoming trips. Stat line: "N activities · N open votes".
- **New trip dialog**: name, destination, start/end date (end ≥ start, validated inline), currency. Creating a trip opens its itinerary.
- "Recent activity" feed (planned) shows a Live indicator and max 5 items with relative times.

### 03 · Itinerary board

- **Trip ribbon** (`itinerary/TripRibbon.tsx`) above the board: the whole trip in one row — the dashboard's day strip at full strength. One cell per day (≥60px, 44px+ tall) on the segmented track: "Day N" (or **Today** in `accent-strong` bold), the short date ("Sun 16", 15px bold, tabular) and one 6px mark per booking and plan in time order (booking marks in the type's ink colour, plans `accent`; at most 6; an empty day shows one `border-input` mark). Cells for the days in view are white with `shadow-segment`; a click scrolls the board to that day. Each cell's `aria-label` reads the day, date, "today" and its counts. It replaces separate prev/next/today buttons.
- One column per day (272px), horizontally scrollable with 32px trailing space. Header: the day-of-month as a 28px bold tabular numeral (the column's landmark, like the times on a flight card) beside "Sun, May" / "Day N"; the heading's accessible name is "Day N, Sun, May 16".
- **Today** (destination time): its column gets a 2px `sign` outline, an `accent-strong` numeral and a yellow "Today" pill, and the board opens scrolled to it. Never colour alone — the pill carries the word.
- **Time order**: a day reads top to bottom in time. The stay strip is pinned first; then timed bookings and timed activities interleave by time (a booking first at the same minute); then activities without a time in their saved order; then bookings still missing a time. Dragging moves an activity to another day; only untimed activities can be reordered within a day.
- A multi-leg booking shows the leg that belongs to the day (departing that day, else arriving), so a round trip's return day shows the return flight.
- Activity card: same density as the booking cards (12px padding, 14px title): time (accent), title, one meta line (location · cost pp), "added by" avatar, drag handle (`aria-label="Drag to move"`).
- **One event, one card.** A scheduled plan that stands for a booking (the API's `Activity.booking`: same day, same or no time, and the booking's name or place in the plan, or a check-in plan on the stay's first day) carries a 44px **Booked** row (white with a `border` hairline so every type chip stays visible; type chip + code) linking to the booking, and that booking's own card is not shown. If it covers the stay check-in, the stay strip reads "Night 1 of N".
- Mobile day header counts every card: "2 bookings · 3 activities".
- Dragging: card tilts −1.5°, accent border + shadow; target shows a dashed accent "Drop here" slot.
- Reordering must also be possible with the keyboard: focus the drag handle, Space to pick up, arrows to move (also across days), Space to drop, Esc to cancel. Screen readers hear it in the user's terms — "Picked up Dinner at Taberna da Rua. Day 1, Fri, May 14, position 2 of 2", "… is over Day 3, Sun, May 16", "Dropped …", "Cancelled. … is back on Day 1" — never ids; the instructions say that time sets the order within a day.
- Moves are optimistic; on failure the board snaps back and an error toast explains why.
- Each column ends with an "Add activity" ghost button (44px; adds straight to that day). Empty days keep the column visible with a dashed "Nothing planned yet" hint — a stay strip alone doesn't count as planned.
- States: the loading skeleton reserves the ribbon and is card-shaped (column with header, strip and two cards); the error state keeps the page header; a trip without days explains why and links to Proposals.
- Scheduled activities without a day appear in a leading **Unplanned** column, only when there are any.
- A Board / Map view toggle will live in the page header once the map view exists.
- **Bookings on the board** take their place in the day's time order and are read-only (edit them on the booking): a Plan-blue tint **stay strip** (`STAY` · "Check-in 14:00 · …", "Night 2 of 5 · …", "Check-out 11:00 · …") and compact booking cards (type code chip, time range, route or title, number · reference). Both link to the booking. A booking that needs details gets the attention border and "Time missing". A day with bookings but no activities drops the "Nothing planned yet" hint.

### 04 · Proposals & voting

- Threshold is stated in the header ("Ideas need 3 votes…") and shown per card as **vote seats**: one 32px seat per vote needed; voters' avatars fill seats in voting order (with `animate-seat-in`), open seats are dashed circles (`role="img"`, "2 of 3 votes"). Beside it: who voted ("Maya and you voted" / "No votes yet") and "N more votes put it on the plan".
- Vote button: labelled **Vote** (chevron) / **Voted** (check, filled accent), 44px, `aria-pressed`, full width on phones. Proposals are about people, so the seats — not a bare count — carry the decision.
- One vote per user per proposal (UI and DB constraint agree).
- Votes are optimistic (instant); a toast confirms when a proposal is accepted and moves to the Accepted tab.
- Open / Accepted / Declined tabs show counts. Owners can **Decline** an open proposal (quiet ghost text button that turns `negative` on hover — it must never be the loudest thing on the card).
- Propose form sits beside the list from `lg` up; below that a "Propose" button reveals it above the list.
- Viewers see the list with vote buttons disabled.

### 05 · Expenses & settle up

- Top: three stat tiles — Trip total, You paid, Your balance (the balance tile is a full-strength `money` panel when positive, `negative-ink` when negative, white text on both).
- Expense table columns: Expense (title + date · category), Paid by (avatar + name), Amount, Your share. Numbers right-aligned, tabular.
- Below `md` the table becomes a compact list (avatar · title · "X paid · date" · amount), and the balance tile, then Settle up and Balances, come before the list (M3 order).
- Settle up card lists the suggested payments (at most n−1): avatars → avatar, "Noa pays Maya", amount on one line; rows involving the current user are highlighted with `money-tint` and get a **Mark €42.10 paid** button on its own line (also for owners), and the toast names what was recorded. Marking paid records a "Settlement" entry that is excluded from Trip total.
- The payer or the owner can delete an expense (trash icon button with `aria-label`, then a confirm dialog).
- Copy: "You pay Maya", "Daniel pays you" — "you" is lower-case mid-sentence.
- Balances use a diverging bar chart centered at zero: money green right = owed to them, red left = they owe. Always also show the signed value.
- Balances always sum to exactly zero (computed server-side with `NUMERIC`, never floats).

### 06 · Members & invites

- Role explainer line under the title (Owner / Editor / Viewer).
- Invite card (owners only): role select (Editor / Viewer) → "Create invite link" → read-only link + "Copy link" (shows "Copied" for 2s). Links expire after 7 days. Email invites are planned.
- Member rows: avatar, name (+ "(you)"), email, role select. Only the owner can change roles; a role nobody can change (the owner's, or any role for non-owners) shows as plain text, not a disabled select.
- Owners can **Remove** others; non-owners can **Leave**. Both confirm first. Members with an unsettled balance can't be removed or leave: instead of the button the row says why ("Owes €96.29 · settle first").
- **Delete this trip** (owners only): a last card with an `attention` border, a one-line warning of what is deleted and that it can't be undone, and a secondary **Delete trip** button in negative colors with a trash icon. It confirms first, then returns to My trips with a toast. Members who have the trip open are sent to My trips with "… was deleted by its owner."

### 07 · Join trip (`/join/:token`)

- Centered card (max 440px) under the logo: "{inviter} invited you to", trip name as H1, destination · role.
- Signed in → one primary **Join trip** button; already a member → **Open trip**; signed out → **Create an account to join** (primary) + **I already have an account** (secondary), both carrying `?next=`.
- Invalid or expired links show the empty-state block with a way back.

### 08 · Bookings (`/trips/:id/bookings`)

- Header: "Bookings" + one-line purpose (hidden on phones); actions **Add booking** (primary, editors only, first) and **Calendar & reminders** (secondary; on phones a 44px bell icon button with the name kept for screen readers, since it is set once).
- Filter pills (toggle buttons with `aria-pressed` in a labelled group, 44px tall, fully rounded): All · Flights · Stays · Things to do · Transport · Dining, each with its count (visible digits plus visually hidden ", N bookings"). Counts are **rows**, so a round trip counts as two flights. The active pill is `sign`. Types with no bookings are hidden (All and the active filter always show). On phones the pills are one row that scrolls sideways with a fade at the right edge; from `sm` they wrap. The filter lives in the URL (`?type=FLIGHT`).
- **Needs details**: before the trip, an attention line (tint-orange, attention border, no live region) at the top names the first booking that needs details, says what's missing, and links **Add details** right after the sentence. During the trip the plan comes first: it shrinks to one linked line ("Sintra train needs departure time →" or "N bookings need details") placed right after Today.
- The page is a **timetable**: one row per booking, and **one row per leg** for multi-leg flights and trains (a round trip's return sits under the day it departs, shares the code, and is done on its own). Rows are grouped by the local day they start ("Fri, May 14 · Day 1"; no day number outside the trip), one white panel per day with hairlines between rows; undated rows go last under "No date yet".
- **Mid-trip**: days before today fold into one **Earlier · N days, N bookings** button (`aria-expanded`; the open/closed state is remembered per trip for the session), so the page opens on today. Only finished rows fold: anything still in effect today (a stay, a multi-day tour) is **pinned first in Today** with "Now" in the time column and "Staying · night 3 of 5 · check-out Wed, May 19 · 11:00" ("In progress · until …" for non-stays), code plate included. Today's heading carries the yellow **Today** pill and its panel a 2px `sign` border. The first row still ahead gets an `accent-strong` time and the yellow **Next** pill. Rows whose end has passed are muted and struck (time, type chip and code plate all step back), with "Done:" for screen readers.
- Row: 22px `figures` time (or "––:––") over the type chip · title (the leg's route for legs) with Next/Cancelled pills · the when line (leg times, "Leg 1 of 2", travellers) · meta (provider · number · price once per booking · documents). Needs details → the chip turns dashed `attention-ink` and the when line reads "Missing departure time"; no extra status chip. The title link stretches over the whole row.
- **Confirmation code**: a monospace plate (15px, 0.1em tracking, `sign` on `bg`) that is a real button — "Copy confirmation code K7Q2ZP" — copying and confirming with a toast; beside it a 44px external-link button when there's a provider URL. Both sit above the row link.
- Type chips follow §1.5: one solid Plan-blue chip for every booked type, the code names it.
- The page content is capped at 880px so each code plate stays near its row on wide screens.
- Empty: "No bookings yet" with **Add your first booking**; a filter with no matches: "No bookings of this type" with an **Add booking** secondary.
- `?add` and `?calendar` open the dialogs (keeping `?type`), so other screens can link straight to them.

### 09 · Booking detail (`/trips/:id/bookings/:bookingId`)

- "All bookings" back link; H1 = booking title with its type chip; subtitle "Type · Provider". Actions: **Edit** (secondary), **Directions** (secondary, pin icon; Google Maps directions to the venue — name + address — or, for flights and trains, "Directions to TLV" for the departure airport/station of the leg on screen; hidden when there's no place) and **Manage on airline site / Manage reservation / Open on provider site** (primary, opens a new tab) when there's a URL.
- Two columns that wrap on narrow screens. Main: the schedule — flights/trains as a leg card (date · number, big departure and arrival times, codes and names, duration, "+1" for next-day arrivals, a note when the zones differ) with an Outbound/Return segmented control when there are several legs; other types as fact tiles (Starts/Check-in, Ends/Check-out, Where). The address shows as text with a **Get directions** link; notes keep line breaks.
- Side: **Confirmation** card (monospace code + **Copy**, which says "Copied" for 2s; then Passengers/People, Price, Status, Added by, Source), **Documents** (file chips that open short-lived signed URLs; delete with confirmation; a dashed "Attach boarding passes / Attach a document" button), **Reminders** for this booking with a link to settings, and **Delete booking** (destructive, confirms; documents are deleted with it).
- Needs details → the attention banner with **Add details**, which opens the edit dialog.
- Below `md` the confirmation code (+ **Copy**) sits directly under the title, before the actions and the leg card — it's what people need at a counter. The side card then starts with Passengers/People.

### 10 · Trip overview / Today (`/trips/:id/overview`, the trip's landing screen)

- Greeting in the destination's time of day ("Good morning, Ido", one line, truncating) and the trip status: "Day 3 of 6 · Sun, May 16 · Lisbon", "Starts in 12 days · 6 days" or "Trip ended". Actions (editors): **Add expense** (primary — the thing people do right after paying) and **Add booking** (secondary); one row, full width on phones. Add to calendar lives with the reminders.
- **Time is honest.** The page keeps its own clock (`useNow`, ticking every minute), so states move on their own. Today's rows read by `agendaStates`: a started row is **in progress** until the next row starts (the last row of the day for 3 h) and only then **done**; the first row not yet started is **next**. A past time never reads "now": `countdown` says "passed". Past bookings drop off the board, a passed **Leave by** disappears, and reminders whose target has passed are filtered out (`Reminder.targetAt`).
- **One "next" for the screen.** The departure board (§1.5) shows the next thing **today**, plan or booking. A booking with leg details gets the full board (time, route, code plate as a copy button that swaps to a check and "Copied", Leave by, Details / Directions / Manage); a plan gets the plan board (time, title, place, **Open itinerary**). When nothing is left today the board falls back to the next booking, labelled "Next booking · Wed, May 19"; with nothing at all: "That's everything for today" / "No departures yet" with a yellow **Add a booking**.
- **Today** (or the first/last day outside the trip) is a **timetable** in one white panel: rows of time (`text-timetable` figures) · type chip (booked = solid tint; a plan nobody has booked = dashed "PLAN"; done = muted) · title and subtitle, split by hairlines. The in-progress row gets a signal-tint wash and a yellow **Now** pill; the next row an `accent-strong` time and an outlined **Next** pill (the board carries the yellow); done rows are muted and struck. Screen readers hear the state first: "Done, 09:30, Attraction: Pena Palace". Every row links: bookings to their detail, plans to the itinerary. A failed agenda load shows "We couldn't load this day's plan." with **Try again** inside the panel — never "Nothing scheduled".
- Side column (desktop 360px; tablets two-up under the day; phones stacked): the **balance panel** at full Money strength (`money`, or `negative-ink` when you owe); **Waiting on the group** with a visible heading (Open ideas in violet; Bookings "Missing details" in red when any booking needs details, else "All confirmed" in blue — the note never repeats the number); **Reminders** (from `md`, next three with countdowns, "Add to calendar" link).
- Phones: the leave-for-the-airport reminder (or the first) shows as a signal-tint strip under the board, linking to its booking (no live region); a **Calendar & reminders** button closes the side column.

### 11 · Add booking (dialog)

- Step 1, **collect**: a dashed drop zone (drag-and-drop or "choose files"; PDF, EML, PNG, JPG up to 15 MB), **Paste email text** (reveals a labelled textarea + **Read text**), **Take a photo** (phones only, opens the camera) and **Enter manually**. Each file is listed with its type chip, name and what was found ("Found 1 flight · 4 people", "Saved as a photo — add the details", or the error in negative ink), plus a remove button. A privacy line explains that files stay in the trip. Primary: **Review N bookings**.
- Step 2, **review** (extra-wide; stacks on phones): the found bookings as a selectable list (type chip, title, Ready / Needs …) and the booking form for the selected one. Fields read from the file are tagged "Read from file"; the source line names the file, with **Remove**. The footer summarises ("2 ready · 1 can be finished later"); **Save N bookings** is disabled only while a booking has no title. Missing times don't block saving: the booking is saved as Needs details.
- Closing the dialog without saving deletes the files uploaded in it. Footers stick to the dialog's bottom edge.

### 12 · Calendar & reminders (dialog)

- **Subscribe in your calendar**: Google Calendar, Apple Calendar and Outlook buttons, and the private `webcal://` link (read-only, select on focus) with **Copy**. "Anyone with this link can see the trip schedule." Owners can **Reset link** (confirms first).
- **Reminders for you**: switches (`role="switch"`, 44px hit area) for Online check-in opens, Time to leave for the airport, Check-out today, Starting soon and Also email me (disabled when every other reminder is off). Changes apply immediately (optimistic).
- Footer: **Download .ics** and **Done**.

### 13 · AI assistants (`/settings/ai`)

- Reached from **AI assistants** in the dashboard header (`aria-current` when open). "Your trips" back link; H1 "Connect an AI assistant" + one line on what an assistant can do. Content max width 880px.
- Three cards, numbered as steps:
  1. **Create a token**: token rows (name, monospace prefix chip "tw_pat_ab12…", "Created … · Last used …/Never used", **Revoke** as a destructive text button that confirms first). One primary **Create token**; with no tokens, the dashed empty block holds it instead.
  2. **Add Tripwise to your assistant**: read-only **Server URL** + **Copy**, a segmented control (Claude Code · Claude Desktop · Cursor) and the setup snippet for that client in a monospace, horizontally scrolling block with **Copy**. A just-created token is filled into the snippets; otherwise they show `<your token>`.
  3. **What your assistant can do**: Read and Add lists, and "It can't delete anything, and on trips where you're a viewer it can only read."
- **Create token** dialog: Name field (with hint), then the token is shown **once** in an attention notice ("Copy it now — you won't be able to see it again") with **Copy** and **Done**.
- Copy buttons say "Copied" for 2s. Labels name only their input — the Copy button sits outside the `<label>`.

### 14 · Trip assistant (panel on every trip screen)

- Opened by **Ask** (sparkle icon, secondary style, `aria-expanded`) at the start of the trip top bar. The conversation is kept while the panel is closed or the section changes.
- Desktop (`lg`+): a non-modal panel docked right, 420px wide, full height, `border-l` + `shadow-popover`; the page reserves the width so nothing is hidden beneath it. Phones and tablets: a full-screen sheet above the tab bar (docking 420px on a tablet would leave the page ~350px). Esc and the 44px close button close it and return focus to **Ask**.
- Empty: one line on what it can do + starter chips (pills, 44px). Loading: a skeleton. Not configured: the dashed empty block. Error: the inline error with **Try again**.
- Messages: the user's in an `accent-tint` bubble on the right; answers as plain text (paragraphs, bullets, **bold**) on the surface. A status line with a pulsing accent dot ("Checking bookings…") shows while tools run; text streams in.
- Citations: small inline number chips (`surface-muted`, `accent-strong`, linking to the source) plus a **Sources** row of 44px chips under the answer — the row is the touch target; the inline chips are a shortcut.
- Suggestion cards (`accent-tint` with `accent-tint-border`): "Add expense" / "Propose an activity" / "Add booking", a summary line and detail line, then **Confirm** (primary) and **Dismiss**. Confirmed → "Added to the trip" with a check. Viewers see a note instead of buttons. Nothing is saved without a confirm.
- Composer: auto-growing textarea (Enter sends, Shift+Enter new line), icon-only **Send** with `aria-label`, and a caption with questions left today and "Answers can be wrong; check the source."

### M1–M4 · Mobile

- **Tab bar**: five tabs — Today, Plan, Bookings, Vote, Money. Members moves to a 44px People button beside the trip name. Bookings and Vote show a dot when something needs attention (labelled for screen readers).
- **Itinerary**: trip name + live indicator, then the **trip ribbon** as the day picker (`role="tablist"`: arrows / Home / End change day, only the chosen day is in the Tab order; same cells as on the board, scrolling only its own track sideways when they don't fit). Opens on today while the trip is on, and scrolls the chosen day into view. One day at a time, in the same time order as the board. Touch replaces drag with a per-card **Move to…** select (44px, full-size); the subtitle explains it.
- **Proposals**: compact cards, 3-segment vote meter, full-width-row "Vote / Voted" button on the right.
- **Expenses**: balance panel at top (full `money` green, or `negative-ink` when you owe), then Settle up, then Recent. "+ Expense" primary in header.
- **Add expense**: full-screen form; big centered amount input with the currency symbol (decimal keyboard); description, paid by, category and **Date** (defaults to today at the destination). The split starts as one summary row ("Split equally, everyone" · "€12.50 each · 4 people" + **Change**); **Change** reveals the split method as a 3-way segmented control (Equally / Percent / Exact) with per-person shares that update live and a validation hint that confirms shares add up to the total. Sticky bottom "Save expense" button.
- No fake OS status bars in mockups; respect safe areas (≥22px bottom padding under the tab bar).

---

## 3. Process rules

- New screen? Add it to the canvas first, then add a section here before building it.
- Any new color, size or radius must be added to the token table **before** it is used.
- PRs touching UI include a screenshot (desktop + mobile) and confirm the checklist below.

### PR checklist

- [ ] Uses tokens only (no stray hex values)
- [ ] Targets ≥ 44px, contrast ≥ 4.5:1, labels on all inputs
- [ ] Loading, empty and error states exist
- [ ] Works at 390px width with no horizontal page scroll
- [ ] Money formatted and signed correctly; tabular numerals
- [ ] Keyboard-accessible (including drag-and-drop alternatives)
