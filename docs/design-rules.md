# Tripwise — Design Rules

> Rules that must hold on **every** screen. Treat a violation as a bug.
> Location in repo: `docs/design-rules.md`. Read this before building or changing any UI (humans and AI coding agents alike).

Status: **draft v0.1** — screens covered: Sign in, Trips dashboard, Itinerary, Proposals, Expenses, Members, Mobile (Itinerary, Proposals, Expenses, Add expense).

---

## 1. Global rules (apply to all screens)

### 1.1 Design tokens — never hard-code outside the token file

| Token                                   | Value                               | Use                                                      |
| --------------------------------------- | ----------------------------------- | -------------------------------------------------------- |
| `color.bg`                              | `#FAFAF8`                           | App background                                           |
| `color.surface`                         | `#FFFFFF`                           | Cards, header, panels                                    |
| `color.surface-muted`                   | `#F1F0EC`                           | Segmented controls, chips, day columns (`#F4F3EF`)       |
| `color.border`                          | `#E7E5E0`                           | Card and divider borders                                 |
| `color.border-input`                    | `#D6D3CC`                           | Inputs, secondary buttons                                |
| `color.text`                            | `#1C1B1A`                           | Primary text                                             |
| `color.text-secondary`                  | `#4A4844`                           | Body copy, inactive nav                                  |
| `color.text-muted`                      | `#6B6862`                           | Meta text, captions (lowest allowed text color)          |
| `color.accent`                          | `#0F766E`                           | Primary buttons, active states, positive money           |
| `color.accent-strong`                   | `#0F5F58`                           | Accent text on tinted backgrounds                        |
| `color.accent-tint`                     | `#E6F4F1`                           | Highlight surfaces (trip card, "you" rows, balance hero) |
| `color.accent-tint-border`              | `#C5E5DF`                           | Border of accent-tint tiles                              |
| `color.accent-deep`                     | `#0B3D39`                           | Headings on accent-tint panels                           |
| `color.accent-ink-soft`                 | `#33524F`                           | Body text on accent-tint panels                          |
| `color.tint-blue` / `color.tint-orange` | `#EEF1FC` / `#FDF1E6`               | Trip card covers (with the matching member ink)          |
| `color.live`                            | `#14B8A6`                           | "Live" connection dot only — never text                  |
| `color.negative`                        | `#C2410C` (bars) / `#B13A0A` (text) | Money owed, destructive actions                          |
| `color.attention`                       | `#FCE3CF` bg / `#9A3412` text       | Counters/badges (e.g. open proposals)                    |

- Exactly **one accent** (teal). Never introduce a second brand color.
- Positive vs negative must differ in **lightness and hue** (teal vs orange — never red/green alone).
- Member avatar palette is fixed: Teal `#CCEBE6/#0F5F58`, Orange `#FCE3CF/#9A3412`, Blue `#DCE3FA/#2E3F9E`, Purple `#E9DDF7/#5B2B8C`, Amber `#FBEBC2/#7A4E00`. A member keeps the same color on every screen (assigned by join order).

### 1.2 Typography

- One family: **Plus Jakarta Sans** (400/500/600/700), fallback `system-ui`.
- Scale: 12 (labels) · 13 (meta) · 14 (body/UI) · 15 (emphasis body) · 17–18 (card/section titles) · 22 (mobile H1) · 28 (desktop page H1) · 32+ (dashboard/hero only).
- Headings use weight 700 and `letter-spacing: -0.02em` at 22px+.
- **All money and counts** use `font-variant-numeric: tabular-nums`.
- Minimum text size **12px**; never use 11px for anything except avatar initials.

### 1.3 Spacing, radius, elevation

- 4px base grid; prefer 8 / 12 / 16 / 20 / 24 / 32 / 48.
- Radius: 6 (chips) · 10 (buttons, inputs, nav items) · 12–16 (cards) · 999 (avatars, pills, dots).
- Elevation is mostly **borders, not shadows**. Shadows only for: the selected segment in a segmented control, an item being dragged, and floating menus/popovers. Use the `shadow-segment` / `shadow-lifted` / `shadow-popover` tokens.
- No gradients, no left-border accent cards, no emoji in UI.

### 1.4 Layout

- Desktop pages are fluid: max content width **1440px** (dashboard 1240px), 32px page padding.
- Trip screens share one shell (`TripLayout`): **top bar** (logo → breadcrumb → Live indicator, member avatars, Invite for owners) + **left sidebar** (trip summary card + section nav with open-proposal count) + content.
- Below `md` (768px) the sidebar is replaced by the trip name block above the content and the bottom tab bar; never show both navigations at once.
- The sidebar is part of a `flex-wrap` row and **stacks above the content on narrow screens**; it is never sticky or `100vh`.
- Wide tables live inside an `overflow-x: auto` box; toolbars and button groups wrap.
- Mobile: 390×844 reference, 20px side gutters, fixed **bottom tab bar** (Plan · Vote · Money · People) with the active tab in accent color + weight 600.

### 1.5 Components

- **Primary button**: accent background, white text, 44px tall (48–52 on mobile primary actions). Max **one** primary button per view region.
- **Secondary button**: white, `border-input` border, text color.
- **Destructive**: text-only in `color.negative`, always requires confirmation.
- **Segmented control / tabs**: muted track, selected segment white with a subtle shadow; uses `role="tablist"`/`role="radiogroup"` correctly.
- **Avatar**: circle, initial, member palette, 2px white ring when stacked (−8px overlap). Tooltip/title with full name.
- **Live indicator**: 8px `color.live` dot + "Live" in `accent-strong` while the subscription is connected; grey dot + "Reconnecting…" otherwise. (Per-person presence is planned; until then never show an "N online" count.)
- **Never use native `<select>`, `type="date"` or `type="time"` inputs** — their look differs per browser. Use the shared components:
  - **Select** (`components/Select.tsx`, Radix): field-styled trigger (44px, or 40px `sm` for inline row controls), 16px chevron with 12px right padding that flips when open; menu = surface card, `rounded-xl`, `border`, `shadow-popover`, 6px gap below the trigger, at least the trigger's width; items 40px tall, hover/keyboard highlight `surface-muted`, the selected item in `accent-strong` semibold with a teal check. Full keyboard support (arrows, type-ahead, Enter, Esc).
  - **Date field** (`components/DateField.tsx`, react-day-picker): trigger shows "Fri, Nov 20, 2026" with a calendar icon; calendar popover with 44px day cells, selected day = accent fill, today = bold + underline, days before `min` disabled; Clear / Today footer. Opening focuses the selected day (or today) for arrow-key navigation.
  - **Time field** (`components/TimeField.tsx`): a Select of 24h times in 15-minute steps plus "Any time"; opens scrolled to the current value.
  - Menus inside a dialog render inside that dialog (`PortalContainerContext`) so they stay above it.
- **Dialog**: native `<dialog>`; full-screen sheet on phones, centered card (440px, or 560px for forms with lists) from `sm` up, **as tall as its content** up to 90vh — the body scrolls and sticky footers stay visible; title + 44px close button in the header.
- **Password field** (`components/PasswordInput.tsx`): every password input has a show/hide eye button inside the field's right edge (44px target, `aria-label` "Show password" / "Hide password", `aria-pressed`); it never submits the form and keeps the typed value.
- **Confirm dialog**: every destructive action (delete expense, remove member, leave trip, delete trip) asks first; confirm button uses `negative` colors.
- **Toast**: bottom-center, auto-dismiss after 4s, `role="status"` (or `alert` for errors); sits above the mobile tab bar.
- **Count badge**: `attention` colors, pill, min 22px.

### 1.6 Accessibility (non-negotiable)

- Touch/click targets **≥ 44×44px**.
- Text contrast **≥ 4.5:1** (3:1 only for 24px+). `#6B6862` on `#FAFAF8` is the lightest text allowed.
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

---

## 2. Screen rules

### 01 · Sign in

- Split layout: brand/value panel (accent-tint) + form panel. Panels stack on mobile (form first).
- Max form width 400px. Order: Email → Password → Sign in → divider → **Explore with the demo account** → Create account link. ("Forgot password?" is added together with the reset flow.)
- **Sign up** (`/sign-up`) reuses this layout with a Name field first and the heading "Create your account".
- Both honour `?next=` (in-app paths only) so an invite link returns the user to the join screen.
- The demo-account entry must always be visible (portfolio visitors).
- Validation errors appear under the field, on blur and on submit.

### 02 · Trips dashboard

- Page title "Your trips" + summary line + one primary "New trip" button.
- Upcoming / Past filter as a segmented control.
- Trip cards in an auto-fill grid (min 300px). Every card shows: status pill, countdown, name, place · dates, member avatars, one stat line. The whole card is a single link.
- Card cover uses a light tint from the avatar palette — no stock photos unless the user uploads one.
- The last grid cell is always the dashed "Plan a new trip" card.
- Card status pill: Upcoming / Happening now / Past; countdown "in N days" on upcoming trips. Stat line: "N activities · N open votes".
- **New trip dialog**: name, destination, start/end date (end ≥ start, validated inline), currency. Creating a trip opens its itinerary.
- "Recent activity" feed (planned) shows a Live indicator and max 5 items with relative times.

### 03 · Itinerary board

- One column per day (272px), horizontally scrollable; header shows `Day N` + date.
- Activity card: time (accent), title, location, cost chip, "added by" avatar, drag handle (`aria-label="Drag to move"`).
- Dragging: card tilts −1.5°, accent border + shadow; target shows a dashed accent "Drop here" slot.
- Reordering must also be possible with the keyboard: focus the drag handle, Space to pick up, arrows to move (also across days), Space to drop, Esc to cancel.
- Moves are optimistic; on failure the board snaps back and an error toast explains why.
- Each column ends with an "Add activity" ghost button (adds straight to that day). Empty days keep the column visible with a dashed "Nothing planned yet" hint.
- Scheduled activities without a day appear in a leading **Unplanned** column, only when there are any.
- A Board / Map view toggle will live in the page header once the map view exists.
- **Bookings on the board** sit above the day's activities and are read-only (edit them on the booking): a teal **stay strip** (`STAY` · "Check-in 14:00 · …", "Night 2 of 5 · …", "Check-out 11:00 · …") and compact booking cards (type code chip, time range, route or title, number · reference). Both link to the booking. A booking that needs details gets the attention border and "Time missing". A day with bookings but no activities drops the "Nothing planned yet" hint.

### 04 · Proposals & voting

- Threshold is stated in the header ("Ideas need 3 votes…") and shown per card with a progress bar + "N more to accept".
- Vote button: 44px, `aria-pressed`; filled accent when the user has voted.
- One vote per user per proposal (UI and DB constraint agree).
- Votes are optimistic (instant); a toast confirms when a proposal is accepted and moves to the Accepted tab.
- Open / Accepted / Declined tabs show counts. Owners can **Decline** an open proposal (destructive text button).
- Propose form sits beside the list from `lg` up; below that a "Propose" button reveals it above the list.
- Viewers see the list with vote buttons disabled.

### 05 · Expenses & settle up

- Top: three stat tiles — Trip total, You paid, Your balance (balance tile uses accent-tint when positive, attention tint when negative).
- Expense table columns: Expense (title + date · category), Paid by (avatar + name), Amount, Your share. Numbers right-aligned, tabular.
- Below `md` the table becomes a compact list (avatar · title · "X paid · date" · amount), and the balance tile, then Settle up and Balances, come before the list (M3 order).
- Settle up card lists the suggested payments (at most n−1); rows involving the current user are highlighted with accent-tint and get a **Mark paid** button (also for owners). Marking paid records a "Settlement" entry that is excluded from Trip total.
- The payer or the owner can delete an expense (trash icon button with `aria-label`, then a confirm dialog).
- Copy: "You pay Maya", "Daniel pays you" — "you" is lower-case mid-sentence.
- Balances use a diverging bar chart centered at zero: teal right = owed to them, orange left = they owe. Always also show the signed value.
- Balances always sum to exactly zero (computed server-side with `NUMERIC`, never floats).

### 06 · Members & invites

- Role explainer line under the title (Owner / Editor / Viewer).
- Invite card (owners only): role select (Editor / Viewer) → "Create invite link" → read-only link + "Copy link" (shows "Copied" for 2s). Links expire after 7 days. Email invites are planned.
- Member rows: avatar, name (+ "(you)"), email, role select. Only the owner can change roles; the owner's own role is locked.
- Owners can **Remove** others; non-owners can **Leave**. Both confirm first; members with an unsettled balance can't be removed.
- **Delete this trip** (owners only): a last card with an `attention` border, a one-line warning of what is deleted and that it can't be undone, and a secondary **Delete trip** button in negative colors with a trash icon. It confirms first, then returns to My trips with a toast. Members who have the trip open are sent to My trips with "… was deleted by its owner."

### 07 · Join trip (`/join/:token`)

- Centered card (max 440px) under the logo: "{inviter} invited you to", trip name as H1, destination · role.
- Signed in → one primary **Join trip** button; already a member → **Open trip**; signed out → **Create an account to join** (primary) + **I already have an account** (secondary), both carrying `?next=`.
- Invalid or expired links show the empty-state block with a way back.

### 08 · Bookings (`/trips/:id/bookings`)

- Header: "Bookings" + one-line purpose; actions **Calendar & reminders** (secondary) and **Add booking** (primary, editors only).
- Filter pills (`role="tab"`, 44px tall, fully rounded): All · Flights · Stays · Things to do · Transport · Dining, each with its count. The active pill is ink-filled.
- An attention banner (tint-orange, attention border) names the first booking that needs details, says what's missing, and links to it.
- Bookings are grouped by the local day they start ("Fri, May 14 · Day 1"; no day number outside the trip); undated ones go last under "Date not set".
- Booking card: 48px type chip (code + color — never color alone; the type is also in visually hidden text), title + provider · number, the "when" line (tabular numerals), reference chip (monospace), document count, status chip (Confirmed / Needs details / Cancelled), price, and an external-link button (44px, labelled) when there's a provider URL. Needs details → attention border and attention-colored "when" line.
- Type colors: Flight blue, Stay teal, Event purple, Attraction/Tour amber, Transport orange, Dining/Other muted.
- Empty: "No bookings yet" with **Add your first booking**; a filter with no matches: "No bookings of this type".
- `?add` and `?calendar` open the dialogs, so other screens can link straight to them.

### 09 · Booking detail (`/trips/:id/bookings/:bookingId`)

- "All bookings" back link; H1 = booking title with its type chip; subtitle "Type · Provider". Actions: **Edit** (secondary), **Directions** (secondary, pin icon; Google Maps directions to the venue — name + address — or, for flights and trains, "Directions to TLV" for the departure airport/station of the leg on screen; hidden when there's no place) and **Manage on airline site / Manage reservation / Open on provider site** (primary, opens a new tab) when there's a URL.
- Two columns that wrap on narrow screens. Main: the schedule — flights/trains as a leg card (date · number, big departure and arrival times, codes and names, duration, "+1" for next-day arrivals, a note when the zones differ) with an Outbound/Return segmented control when there are several legs; other types as fact tiles (Starts/Check-in, Ends/Check-out, Where). The address shows as text with a **Get directions** link; notes keep line breaks.
- Side: **Confirmation** card (monospace code + **Copy**, which says "Copied" for 2s; then Passengers/People, Price, Status, Added by, Source), **Documents** (file chips that open short-lived signed URLs; delete with confirmation; a dashed "Attach boarding passes / Attach a document" button), **Reminders** for this booking with a link to settings, and **Delete booking** (destructive, confirms; documents are deleted with it).
- Needs details → the attention banner with **Add details**, which opens the edit dialog.

### 10 · Trip overview / Today (`/trips/:id/overview`, the trip's landing screen)

- Greeting in the destination's time of day ("Good morning, Ido") and the trip status: "Day 2 of 6 · Sat, May 15", "Starts in 12 days · 6 days" or "Trip ended". Actions: **Add to calendar** (secondary) and **Add booking** (primary).
- **Up next** card: a tinted header strip in the booking type's color ("Up next · Flight" + "Departs in 1 h 35 min"), then the leg (times, codes, duration) or the booking's title, date and place, then confirmation code + copy, **Details**, **Directions to …** (departure airport for flights, the venue otherwise) and **Manage booking**. With nothing ahead: a dashed card that invites adding a booking.
- **Today** (or the first/last day outside the trip): one ordered list mixing bookings, check-in/out and planned activities by time — time (accent, tabular), 32px type chip, title and subtitle. Bookings link to their detail.
- Side column: **Reminders** (next three, with countdowns; link to settings) and four "at a glance" tiles (Bookings, Open ideas, Spent, Your balance) that link to their sections.
- Mobile: the first reminder shows as a blue banner under Up next; the side reminders card is hidden.

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
- Desktop (`md`+): a non-modal panel docked right, 420px wide, full height, `border-l` + `shadow-popover`; the page reserves the width so nothing is hidden beneath it. Phones: a full-screen sheet above the tab bar. Esc and the 44px close button close it and return focus to **Ask**.
- Empty: one line on what it can do + starter chips (pills, 44px). Loading: a skeleton. Not configured: the dashed empty block. Error: the inline error with **Try again**.
- Messages: the user's in an `accent-tint` bubble on the right; answers as plain text (paragraphs, bullets, **bold**) on the surface. A status line with a pulsing accent dot ("Checking bookings…") shows while tools run; text streams in.
- Citations: small inline number chips (`surface-muted`, `accent-strong`, linking to the source) plus a **Sources** row of 44px chips under the answer — the row is the touch target; the inline chips are a shortcut.
- Suggestion cards (`accent-tint` with `accent-tint-border`): "Add expense" / "Propose an activity" / "Add booking", a summary line and detail line, then **Confirm** (primary) and **Dismiss**. Confirmed → "Added to the trip" with a check. Viewers see a note instead of buttons. Nothing is saved without a confirm.
- Composer: auto-growing textarea (Enter sends, Shift+Enter new line), icon-only **Send** with `aria-label`, and a caption with questions left today and "Answers can be wrong; check the source."

### M1–M4 · Mobile

- **Tab bar**: five tabs — Today, Plan, Bookings, Vote, Money. Members moves to a 44px People button beside the trip name. Bookings and Vote show a dot when something needs attention (labelled for screen readers).
- **Itinerary**: trip name + live indicator, then a horizontally scrolling day picker (segmented control). One day's activities at a time, as a vertical list. Touch replaces drag with a per-card **Move to…** select (44px).
- **Proposals**: compact cards, 3-segment vote meter, full-width-row "Vote / Voted" button on the right.
- **Expenses**: balance hero card at top (accent-tint), then Settle up, then Recent. "+ Expense" primary in header.
- **Add expense**: full-screen form; big centered amount input (decimal keyboard); split method as a 3-way segmented control (Equally / Percent / Exact); per-person shares update live; a validation hint confirms shares add up to the total; sticky bottom "Save expense" button.
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
