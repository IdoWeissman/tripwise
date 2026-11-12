---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/components/TripLayout.tsx","src/styles.css"]
---

# Tripwise web app — whole-app visual world

Scope: every screen under apps/web (trip shell, Today/overview, itinerary, bookings, proposals, expenses, members, trips list, sign-in, join, dialogs). Mode: Operate. Groups of friends use it on phones mid-trip, in daylight, Hebrew content today, RTL later.

## Direction contract

THESIS: The trip runs like a well-run station: signs you trust at a glance, every plan a timetable line. Refuses the category default of white cards, one violet accent and a soft balance hero.

OWN-WORLD: Enamel sign blue #0B2A6F rail and boards, signal yellow #FFC917 rationed to now/next and you-are-here, white sign panels on a cool #F2F4F8 ground, red #D23A1E for owed money. Section hues at full strength on their sign: Plan blue, Vote violet, Money green. Archivo with its width axis: narrow tabular figures for times and amounts, 8px corners, 8px modular grid, hairline timetable rules.

STORY: Open the app and know what departs next, what today holds and where the money stands; act on it in one tap.

FIRST VIEWPORT: Deep-blue sign rail left (bottom tab bar on phones) with the yellow you-are-here bar. Main: greeting and day line, then the departure board for Up next (56px yellow tabular time, white route, platform-style code, Leave by). Below, Today as a timetable. Right column: money panel in Money green, open ideas, reminders. Primary action "+ Add booking" top right.

FORM: Platform (European rail wayfinding), position 1 on the ordered list, the roll. seed:b3fcb6fe817d9ae3. Raises: state never colour alone (dashed unconfirmed, solid confirmed, struck past); strict 8px grid; one hue per section; destructive actions isolated; next lifts, done recedes; size ramp for times and amounts. Signature interaction: the active board row flips in with a short split-flap style vertical slide; motion is short, mechanical, no bounce.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
