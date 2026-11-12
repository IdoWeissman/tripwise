---
name: Tripwise
description: A shared trip run like a well-run station: signs you trust at a glance, every plan a timetable line.
colors:
  sign: "#0b2a6f"
  sign-raised: "#163c8c"
  sign-ink-soft: "#b9c6e4"
  signal: "#ffc917"
  signal-tint: "#fff1c2"
  signal-ink: "#7a5300"
  accent: "#1f5fd1"
  accent-strong: "#163c8c"
  accent-tint: "#e3ecff"
  accent-tint-border: "#c3d4fa"
  vote: "#6b3fd4"
  vote-tint: "#eee6ff"
  money: "#0b7a54"
  money-tint: "#e1f4ea"
  rail-plan: "#5b8cf0"
  rail-book: "#7fd0f0"
  rail-vote: "#b49cf5"
  rail-money: "#5fd3a3"
  live: "#3ddc97"
  negative: "#d23a1e"
  negative-ink: "#b8311a"
  attention: "#fde2da"
  attention-ink: "#9e2a12"
  tint-orange: "#fdeee6"
  bg: "#f2f4f8"
  surface: "#ffffff"
  surface-muted: "#e9edf3"
  surface-column: "#edf0f5"
  border: "#dce1ea"
  border-input: "#c3cad6"
  ink: "#111418"
  ink-secondary: "#3a4150"
  ink-muted: "#5a6272"
typography:
  board-time:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "56px"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "\"tnum\""
    fontVariation: "\"wdth\" 82"
  display:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "48px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\""
    fontVariation: "\"wdth\" 82"
  headline:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 800
  timetable-time:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    fontFeature: "\"tnum\""
    fontVariation: "\"wdth\" 82"
  body:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  meta:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    letterSpacing: "0.06em"
rounded:
  chip: "4px"
  control: "8px"
  card: "12px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "32px"
  xl: "40px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.sign}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.sign-raised}"
  button-primary-disabled:
    backgroundColor: "{colors.accent-tint-border}"
    textColor: "{colors.sign}"
  button-vote:
    backgroundColor: "{colors.vote}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.control}"
    height: "44px"
  button-destructive:
    backgroundColor: "transparent"
    textColor: "{colors.negative-ink}"
    rounded: "{rounded.control}"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  type-chip:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.accent-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    height: "28px"
  next-pill:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.sign}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  count-badge:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.sign}"
    rounded: "{rounded.pill}"
    height: "22px"
  rail-item-active:
    backgroundColor: "{colors.sign-raised}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "44px"
  departure-board:
    backgroundColor: "{colors.sign}"
    textColor: "{colors.surface}"
    rounded: "{rounded.card}"
  timetable-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  balance-panel:
    backgroundColor: "{colors.money}"
    textColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "20px 24px"
  balance-panel-owed:
    backgroundColor: "{colors.negative-ink}"
---

# Design System: Tripwise

## Overview

**Creative North Star: "Platform"**

The trip runs like a well-run European rail station. Navigation and the most important information live on enamel sign blue, the way a platform sign does; everything else sits on white sign panels over a cool grey ground. A traveller glancing at a phone mid-trip, in daylight, should read what departs next, what today holds and where the money stands without hunting for it.

The system is dense and typographic rather than decorative. Times and amounts are set big in narrow tabular figures so they line up like a printed timetable; labels are small. Hierarchy comes from a size ramp and from colour fields, not from shadows or ornament. Signal yellow is the station's "you are here": it is rationed to now, next and the current location, and its scarcity is what makes it legible.

Every section owns one hue at full strength on its own sign: Plan blue for itinerary and bookings, Vote violet for proposals, Money green for expenses. State is carried by form as well as colour: a confirmed booking is a solid chip, an unbooked plan is dashed, a departed row is struck through and muted, the next row lifts.

**Key Characteristics:**

- Enamel blue sign rail (desktop) or sign header plus white bottom tab bar (phones), never both.
- Signal yellow only for now / next / you-are-here.
- One family, Archivo, using its width axis: narrow tabular figures for times, amounts, counts and codes.
- Flat: colour fields and hairlines, three named shadows for transient states only.
- 8px grid, 4 / 8 / 12px corners.
- Short, mechanical motion: the departure row turns over like a split-flap.

## Colors

A cool, institutional palette: one deep enamel blue carrying structure, one rationed yellow, three section hues, and a red that means money owed or danger.

### Primary

- **Enamel Sign Blue** (sign): the rail, the phone and account headers, the departure board, primary buttons, filter pills when active, the selected calendar day, toasts. It is the system's structure, not an accent.
- **Raised Sign Blue** (sign-raised): the active rail item, buttons that sit on the sign (Ask, People), primary hover.
- **Sign Mist** (sign-ink-soft): secondary text on the sign (7.8:1 on sign blue). The only non-white text colour allowed on the sign.

### Secondary

- **Signal Yellow** (signal): the you-are-here bar on the rail and tab bar, the departure time on the board, the countdown, the Next pill, the logo plate, text selection. Never a fill for large areas.
- **Signal Cream / Signal Umber** (signal-tint / signal-ink): the phone reminder strip and its bell.

### Tertiary

- **Plan Blue** (accent): links, focus rings, the caret, progress fills, the Plan section mark. With **Plan Ink** (accent-strong) on **Plan Tint** (accent-tint) it forms every booking type chip and the lifted Next time in the timetable.
- **Vote Violet** (vote / vote-tint): the Proposals section only: its primary and Vote buttons, open-ideas count.
- **Money Green** (money / money-tint): the Expenses section only: the balance panel when you are owed or settled, positive balances.
- **Rail Marks** (rail-plan, rail-book, rail-vote, rail-money): lightened section hues for the small square marks on the blue rail, where the full-strength hues would not read.
- **Live Green** (live): the connection dot on the sign. Never text.

### Neutral

- **Platform Grey** (bg): the app ground.
- **Sign Panel White** (surface): panels, the timetable, dialogs, the bottom tab bar, inputs.
- **Track Grey / Column Grey** (surface-muted / surface-column): segmented-control tracks, neutral code chips, skeletons / itinerary day columns.
- **Hairline / Input Edge** (border / border-input): timetable rules and panel edges / input strokes and hovered secondary edges.
- **Station Ink / Body Ink / Meta Ink** (ink / ink-secondary / ink-muted): headings and data / body copy / captions. Meta Ink is the lightest text allowed (5.6:1 on Platform Grey).
- **Owed Red** (negative / negative-ink): money owed (panel, text, minus sign), destructive actions, tab-bar alert dots, toast errors.
- **Alert Blush / Alert Rust / Alert Wash** (attention / attention-ink / tint-orange): missing-details alerts, invalid fields, destructive hover.

### Named Rules

**The Rationed Yellow Rule.** Signal yellow marks only now, next and you-are-here. If a screen has more than a handful of yellow marks, it has become a construction site.

**The One Hue Per Section Rule.** A section's hue lives on that section's sign and never decorates another section. Booking chips are always Plan blue; the 3–5 letter code names the type, not a colour.

**The Signed Money Rule.** Owed and owed-to-you differ in hue and sign (green `+`, red `−` with the real minus), never colour alone.

## Typography

**Display Font:** Archivo Variable (with system-ui, which also covers Hebrew)
**Body Font:** Archivo Variable
**Label/Mono Font:** Archivo at 82% width with tabular numerals for figures; the platform monospace only for confirmation codes.

**Character:** A grotesque that can narrow itself. Headings run heavy (800) and tight; times and amounts drop to 82% width with tabular figures, so a column of departures reads like a printed board.

### Hierarchy

- **Board time** (800, 44px phone / 56px desktop, line-height 1, figures): the next departure on the departure board, in signal yellow.
- **Display** (800, 44px phone / 48px desktop, 1.1, -0.02em, figures): the balance amount.
- **Headline** (800, 26px phone / 34px desktop, -0.02em): page H1 and the greeting.
- **Board route** (800, 22px phone / 26px desktop, -0.01em): the route on the departure board.
- **Timetable time** (800, 22px, figures): times on timetable rows (Today and Bookings).
- **Title** (800, 16–18px): panel headings and row titles (row titles at 700).
- **Body** (400–500, 14–15px): UI and body copy; buttons at 15px 700.
- **Meta** (400, 13px): captions and meta lines under titles.
- **Label** (800, 12px, 0.06em): type-chip codes (FLT, STAY, SHOW, PLAN). Minimum text size; 11px only for avatar initials.

### Named Rules

**The Timetable Figures Rule.** Every time, amount, count and code uses the `figures` treatment (tabular numerals, 82% width). Importance is a size ramp: the figure is big, its label is small.

**The Codes Are Data Rule.** Confirmation codes sit on a white plate in monospace with wide tracking (0.1em), never in body type.

## Layout

An 8px modular grid (8 / 16 / 24 / 32 / 40 / 48; 4px only inside dense controls).

Trip screens share one shell. From `lg` (1024px) up, a 248px sticky full-height sign rail holds the logo plate, trip name and dates, section nav, then at the bottom Ask, avatars, Live, My trips and Invite; content sits right of it at max 1200px with 40px side padding and no top bar. Below `lg`, a one-row sign header (logo plate, trip name and dates truncated, Live dot, Ask, People) and a fixed white five-tab bottom bar replace the rail. Account pages use a one-row sign header at all widths.

The Today screen is a two-column grid at `lg`: the main column (departure board, then the timetable) and a 360px side column (balance panel, waiting-on-the-group panel, reminders), 24–32px gaps. On phones the columns stack and one reminder strip appears under the board. Phone gutters are 16px at a 390px reference width. Wide tables scroll inside their own box; toolbars wrap.

## Elevation & Depth

Flat. Depth is conveyed by colour fields (blue sign on grey ground, white panels on grey) and hairlines. Shadows exist only for transient states.

### Shadow Vocabulary

- **Segment** (`box-shadow: 0 1px 2px rgb(17 20 24 / 0.08)`): the selected segment in a segmented control.
- **Lifted** (`box-shadow: 0 12px 24px rgb(11 42 111 / 0.2)`): an item being dragged on the itinerary board.
- **Popover** (`box-shadow: 0 8px 24px rgb(17 20 24 / 0.14)`): select menus, date pickers, the skip link.

### Named Rules

**The Colour Fields Not Shadows Rule.** A panel at rest has no shadow. If it needs to stand out, it moves onto the sign or a section hue.

## Shapes

Three corners and a pill: 4px for chips and code plates, 8px for controls (buttons, inputs, nav items, the logo plate), 12px for panels, boards and dialogs, full round for avatars, pills, dots and badges. Small marks (section squares, you-are-here bars) are 3px-cornered. State is drawn with the stroke: solid chips for booked, 1.5px dashed outlines for plans nobody has booked and for missing details, strikethrough for done. Panels are borderless on the grey ground; rows inside them are separated by 1px hairlines.

## Components

### Buttons

Sign-board solid and plain-spoken: verbs in sentence case, 15px bold.

- **Shape:** gently squared (8px), 44px minimum height, 20px horizontal padding, 8px icon gap.
- **Primary:** sign blue with white text; one per region. Disabled stays readable: deep blue text on the pale blue tint-border fill, never faded.
- **Hover / Focus:** primary to raised sign blue; colour transition only. Focus is a 2px Plan blue outline offset 2px everywhere.
- **Vote:** the Proposals primary wears Vote violet.
- **Secondary:** white with a 1.5px hairline edge and ink text; hover darkens the edge to the input edge and the fill to Platform Grey.
- **Ghost:** transparent, body ink, Track Grey on hover.
- **Destructive:** transparent with Owed Red ink, Alert Blush on hover; stands alone, never beside the primary, always confirms.
- **On the sign:** the Ask and People buttons are raised sign blue; when open they invert to white with sign-blue text.

### Chips

- **Type chip:** Plan tint with Plan ink, 4px corners, 28px tall in the timetable, 12px 800 code with 0.06em tracking (FLT, STAY, SHOW, SIGHT, TOUR, RAIL, FOOD, MISC, IN, OUT). The label is screen-reader text; the code is visual.
- **Unbooked plan:** the same chip as a 1.5px dashed Meta Ink outline reading PLAN.
- **Next pill:** signal yellow, sign-blue text, full round, 12px 800.

### Cards / Containers

- **Corner Style:** 12px.
- **Background:** white panels on Platform Grey; the sign and section hues for boards that carry the screen's main fact.
- **Shadow Strategy:** none at rest (see Elevation & Depth).
- **Border:** none on panels; 1px hairlines between rows. Stat tiles carry a 1px hairline edge.
- **Internal Padding:** 20px phone / 24px desktop horizontally, 12–20px vertically.

### Inputs / Fields

- **Style:** white, 1px input edge, 8px corners, 44px tall, 12px padding, 14px text; label above at 14px 600.
- **Focus:** the global 2px Plan blue outline.
- **Error:** border turns Owed Red, message below in Owed Red ink at 13px. Native select, date and time inputs are replaced by the shared Select, Date and Time fields.

### Navigation

- **Rail (desktop):** 15px items, 44px tall, 8px corners; each has a 14px section mark square and an optional white count badge. Inactive items are white at 85% and wash white/10 on hover; the active item is raised sign blue, bold, with a 5px signal-yellow you-are-here bar on the rail's left edge.
- **Bottom tab bar (phones):** white, hairline top edge, five tabs at 56px with 22px icons and 12px labels. Active is sign blue bold with a 4px signal-yellow bar along its top; needs-attention shows a 10px Owed Red dot with a white ring.
- **Segmented control:** Track Grey track with 4px inset, 44px segments; selected segment white with the Segment shadow.

### Departure Board

The signature. A sign-blue panel in three strips separated by white/15 hairlines. Header: "Up next · Type" in Sign Mist on the left, the countdown in signal yellow on the right (13px bold). Row: board time in yellow, the route in white with a Sign Mist meta line, the confirmation code on a white plate with a copy button, and Leave by (flights) as a 26–28px figure. Footer: white text links (Details, Directions, Manage) that turn yellow on hover. When the next departure changes, the row turns over with the flap-in motion (320ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`, a short vertical slide with a slight X-rotation, no bounce), behind `motion-safe`.

### Timetable

One white panel, never a stack of cards. Each row is a three-column grid (time 64/88px, chip 56/64px, title) at 64px minimum height, separated by hairlines. The next timed row lifts (time in Plan ink, yellow Next pill); departed rows are muted and struck through. Booked rows link to their booking and wash Platform Grey on hover.

### Balance Panel

A Money-green panel (Owed Red ink when you owe) with a 15px bold label, the signed balance at display size in white figures, and a white/90 summary line. The whole panel is one link to Expenses.

## Do's and Don'ts

### Do:

- **Do** set every time, amount, count and code in the figures treatment, and make the figure bigger than its label.
- **Do** keep signal yellow to now, next, you-are-here, the logo plate and text selection.
- **Do** show state with form as well as colour: solid booked, dashed unbooked, struck done, lifted next.
- **Do** keep one primary (sign blue, or Vote violet on Proposals) per region, 44px minimum touch targets, and Meta Ink as the lightest text.
- **Do** put the screen's main fact on the sign or its section hue rather than raising it with a shadow.
- **Do** keep motion short and mechanical (200–320ms, no overshoot) and behind `motion-safe`.

### Don't:

- **Don't** use a section hue outside its section, or colour a booking chip by type.
- **Don't** use shadows on panels at rest; only Segment, Lifted and Popover exist.
- **Don't** use gradients, glass, coloured side-stripes on cards, or emoji in UI.
- **Don't** stack separate cards where a timetable panel with hairline rows belongs.
- **Don't** set text below 12px (11px only for avatar initials) or use non-white, non-Sign-Mist text on the sign.
- **Don't** place a destructive action next to the primary, or run it without a confirm.
