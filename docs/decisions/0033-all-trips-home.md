# 0033 — "All trips" home: land there unless a trip is live; it replaces the switcher sheet

**Status:** Accepted
**Date:** 2026-07-14
**Refines:** [0021](0021-multi-trip-membership.md) (active-trip resolution), [0024](0024-app-shell-and-trip-lifecycle.md) §5 (trip switcher)

## Context

ADR-0024 made the trip switcher a **sheet** ("not a route") and, with ADR-0021, always resolved _some_ active trip and dropped you straight into it (in-progress → nearest upcoming → most recent). Two problems surfaced while designing the switcher:

1. **No home base.** There was nowhere to see and manage your trips as a set — only a transient sheet on top of whichever trip you were forced into.
2. **You get dropped into a trip that isn't happening.** When nothing is in progress, ADR-0021 still opens the nearest upcoming trip in Plan mode. Waypoint is a "when you're on the ground" tool; if you're not on the ground on any trip, the right place is an overview, not someone else's future itinerary.

## Decision

**1. An "All trips" home is a real surface** (`/trips`) — a lean list of your trips, each with a date-derived **now / soon / past** chip, plus **create**. It is a page, not a sheet.

**2. Landing rule (refines ADR-0021).** On load, authenticated:

- **A trip is live** (in progress today, by dates) → open it directly (`/`) — on-the-ground priority is preserved.
- **No trip is live** (all upcoming/past) → **All trips** home. Do not auto-open a future trip.
- **No trips at all** → Zero-state (unchanged, ADR-0024 §2).

`resolveActiveTrip` keeps its in-progress branch; the upcoming/past fallbacks now feed "which trip is marked, if any" on the All-trips page rather than a forced landing.

**3. Access from inside a trip (replaces ADR-0024 §5's sheet).** The trip name in the in-trip header (▾) navigates to All trips — one surface, reached both as the landing and as the way "out and across." The switcher **sheet** is dropped; there are not two presentations of the same list.

**4. No "Join with a link" on this surface.** Joining always begins from an external invite link (ADR-0030) — a join button here is redundant. Create only. (Zero-state keeps Join: it's the genuine first-run "open the app first" path.)

**5. Not a dashboard, and no board.** The All-trips page is a navigation list, not a lobby of rich cards. Nothing is "live" on it (a live trip would have opened directly), so it carries **no departure board** — the board stays inside a trip, keeping the "board = the trip is speaking" scarcity (ADR-0028).

## Amendment — a third control on the card, and the gesture that pays for it (2026-08-30)

ADR-0213 put a share action on every All Trips card. The owner reported the consequence:
_"The share icon is taking much space and is causing a line overflow. Perhaps we need a long
click instead?"_ Measured in
[`mockups/the-trip-card-has-room-for-one-more-control-v1.html`](../../mockups/the-trip-card-has-room-for-one-more-control-v1.html);
decided in [v2](../../mockups/the-trip-card-has-room-for-one-more-control-v2.html).

**§1 · The share leaves the row for a hold.** Not a new gesture: `lib/useHoldToOpen.ts`
already exists (ADR-0202's 2026-08-22 amendment) for the same trade in the same words — it
_"costs no pixels, which is the reason a fourth mark in the row's trailing slot was not the
answer"_ — under the same rule, that a hold is _"a shortcut, never the only way"_ and is paid
for by a visible twin elsewhere. The twin here is the trip header's share control, which is
what makes the gesture affordable on this surface. The hook already owns the two hard parts:
the `selectstart` guard, and swallowing the click that lands on release.

**§2 · The countdown becomes the card's loud element.** With the share gone the trailing slot
is free, and `בעוד 12 ימים` is the one fact that varies _inside_ its section — the heading
above already says the state, so what discriminates between two cards is how soon. It spends
**amber**, which the colour budget files countdowns under, at the recipe `.hdr-anchor.is-back`
already uses: a tinted ground with `--amber-deep` for edge and ink, because `--amber` as text
on paper is 1.31:1 and is a fill, never ink. No glow and no pulse — the card stays a nav card
and does not start reading as the rationed board.

**§3 · `הסתיים` is deleted, not promoted.** Under a `הסתיים` heading, over dates already in
the past, it repeats its own heading and distinguishes no two cards. Deleting it returns the
content column to 238px at 360px with the meta on **one** line and the card at 74px — the
largest single win available, and it applies to most of the list.

**Rejected: the slide-out drawer.** The owner asked for the row to move and the share to be
revealed beside it. Nothing in this app opens a row sideways, so it is a new mechanism for one
button — needing its own dismissal, its own back-stack layer (ADR-0090), and an answer for a
tap outside it. `useHoldToOpen` opens a surface directly, and the surface here is the share
sheet, which is response enough that there is no silent moment to cover. Drawing it also
surfaced a cost nobody had named: with the drawer open the card is pushed far enough that the
**trip's flag leaves the screen** — the card's fastest recognition cue, and the shared element
the trip handoff flies (ADR-0140 §7).

Also rejected: shrinking the control (44px is ADR-0017's floor and the saving was 6px), and
letting the meta ellipsise rather than wrap — the first thing cut is the member count, the one
fact in that row that appears nowhere else on the card.

**Built the same day, at the middle weight.** The mockup left the countdown's loudness
(`שקט · נייר · מלא`) to a device pass; the owner handed the call back (_"Do what looks best in
your opinion"_), so it ships as `נייר` — the `.hdr-anchor.is-back` recipe exactly, at 12px and
`5px 10px`. The solid amber fill was the alternative and was declined on the same ground §2
already states: an amber _fill_ on a nav card starts borrowing the rationed board's grammar,
and this list is deliberately glowless. `.chip.past` and its `chipPast` string are gone,
`.chip` collapsed into the one `.chip.soon` rule it has a consumer for, and `.trip-share-wrap`
/ `.trip-share-action` / `t.share.entryFor` are deleted with the control they existed for.

What the specs hold, and the split is the usual one: the unit suite (`AllTrips.test.tsx`) has
the hold firing on the card the finger is on and _not_ firing when the finger moves, since
jsdom implements no `PointerEvent` and the hook is written for exactly that shape of event.
The browser (`e2e/trip-share-entry.spec.ts`) has the half jsdom cannot see — that the click
landing on **release** is swallowed rather than opening the trip behind the sheet — plus the
width, as the card's height: 74px on the e2e fixture against the 104px the mockup measured on
the shipped one.

## Consequences

- Supersedes the "switcher is a sheet, not a route" line of ADR-0024 §5; that section now describes the All-trips page. Routing map gains `/trips` and the live-vs-not landing branch.
- `mockups/trip-switcher-v1.html` → renamed `mockups/all-trips-v1.html`, rebuilt as a page (greeting header, trip list with now/soon/past chips, single create CTA, offline state).
- **Implementation follow-up:** the `/new`-style shell route `/trips` + the landing branch in `App.tsx`; the current switcher-sheet stub (`Sheet` render for `'switcher'`) is replaced by navigation to `/trips`. `CreateJoinActions` is no longer used here (create is a plain button); it stays in the zero-state.
- Shell chrome unchanged: indigo/neutral, no amber/teal/violet (ADR-0028).
- **Trip identity is a single free-text `destination` string** (as modeled — one column, no structure). Each trip row shows `destination · dates · member-count`, all model-derived. Earlier mockups drew a multi-stop itinerary ("טוקיו → קיוטו → אוסקה") in the destination line — that implied a structured multi-destination the model doesn't have. **Structured multi-destination is deferred** (it would mean per-leg stops/dates, a real model change); a user who wants a route can still type one into the free-text field.

## Revision (2026-07-16) — v2 presentation: sectioned list + a live-trip hero

The first shipped version (`all-trips-v1.html`) was a flat list where the live trip was near-invisible (an off-white card) and the meta line was cramped. The presentation is revised — **the decisions above are unchanged** (still a navigation list, create-only, no join, shell chrome); only how the list is drawn changes. Reference mockup: `mockups/all-trips-v2.html` (supersedes v1).

1. **The list is sectioned** by the same date-derived split — `עכשיו` / `בקרוב` / `הסתיים` — instead of one flat run under a total count. Hierarchy is read at a glance; the `now/soon/past` chip is dropped from the `now` group (the section header + hero carry it).
2. **The live trip gets a prominent indigo hero.** This is the one loud element on an otherwise paper page: chrome-base `--indigo` (never the darker `--board`), elevated, with an enter affordance. **It is a nav card, not a departure board** — no board glow, no pulse, no Now/Next content — so §5 ("no board here") and the ADR-0028 board-scarcity rule both still hold. This clarifies, rather than reverses, §5: _the prohibition is on the board surface + its live grammar, not on using the chrome color prominently._ No "active trip" caption sits on the hero: the `עכשיו` section header above it and the indigo prominence already carry that, so a label would only crowd the trip name (the visible section text still provides the non-color redundancy).
3. **Meta line follows the type system.** Spaced middots (`·`), and the date range + member count set in JetBrains Mono `dir="ltr"` (design-language: mono = dates/numbers). Isolating the numeric run in `dir="ltr"` also fixes an RTL bidi bug where the date range rendered reversed (`23.07–16.07`). Card titles move to `Secular One` (the ramp's h3). A `destination` that the trip name already contains is hidden to keep the line lean.
4. **Past trips** are de-emphasized a notch (quieter surface + desaturated icon).

## Revision (2026-07-16) — the landing rule wins over the last-opened trip on a cold reopen

The landing rule (§2) said "a trip is live → open it directly," but the implementation let the persisted last-opened `tripId` (the per-device active-trip state, ADR-0021) win unconditionally: reopening the app dropped you back on the last trip you visited even when a **different** trip was live right now. That contradicts on-the-ground priority — the whole point of §2.

The fix distinguishes two ways you arrive at the trip surface:

1. **A manual pick this session** — tapping a trip on /trips, creating, or joining — is honored regardless of whether that trip is live. You asked for it; you land in it. (This is the "manual pick honored" behavior §2's `resolveActiveTrip` note alluded to.)
2. **A cold reopen** (a fresh app launch, no in-session pick) applies the §2 rule directly: a live trip opens, nothing live goes to /trips. The stored last-opened id only wins here when it is **itself** live — that preserves "default to last-opened among overlapping live trips" (ADR-0021) while stopping a stale non-live id from shadowing a trip that is live now.

The two cases are told apart by an in-memory `pickedThisSession` flag on the active-trip state (`frontend/src/state/active-trip-id.tsx`) — set on an explicit pick, absent after a fresh launch, so a reopen is always treated as a cold load. The decision itself is the pure `resolveLanding` helper in `frontend/src/lib/active-trip.ts`. No change to the persisted `tripId` semantics (still per-device, not synced) or to any other landing branch.
