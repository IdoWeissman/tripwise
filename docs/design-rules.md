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
- Elevation is mostly **borders, not shadows**. Shadows only for: the selected segment in a segmented control, and an item being dragged. Use the `shadow-segment` / `shadow-lifted` tokens.
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
- **Dialog**: native `<dialog>`; full-screen sheet on phones, centered card (440px, or 560px for forms with lists) from `sm` up; title + 44px close button in the header.
- **Confirm dialog**: every destructive action (delete expense, remove member, leave trip) asks first; confirm button uses `negative` colors.
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

### 07 · Join trip (`/join/:token`)

- Centered card (max 440px) under the logo: "{inviter} invited you to", trip name as H1, destination · role.
- Signed in → one primary **Join trip** button; already a member → **Open trip**; signed out → **Create an account to join** (primary) + **I already have an account** (secondary), both carrying `?next=`.
- Invalid or expired links show the empty-state block with a way back.

### M1–M4 · Mobile

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
